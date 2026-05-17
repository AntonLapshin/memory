import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';
import { getDbPath, getAllMemoryFiles } from './config.js';
import { readMemoryFile } from './memory-file.js';
import { generateEmbedding } from './embeddings.js';
import { logger } from './logger.js';
import type { MemoryFile, SearchResult, IndexResult } from './types.js';

let db: Database.Database | null = null;

function getDb(): Database.Database {
  if (db) return db;
  const dbPath = getDbPath();
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  sqliteVec.load(db);
  logger.debug('Opened SQLite database', { path: dbPath });
  return db;
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
    logger.debug('Closed SQLite database');
  }
}

export function ensureTable(): void {
  const d = getDb();
  d.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS vec_memories USING vec0(
      path TEXT,
      title TEXT,
      summary TEXT,
      tags TEXT,
      created TEXT,
      modified TEXT,
      summary_embedding float[768]
    )
  `);
  logger.debug('Ensured vec_memories table exists');
}

export async function upsertMemory(memory: MemoryFile): Promise<void> {
  logger.info('Upserting memory to SQLite', { path: memory.path });

  ensureTable();
  const d = getDb();
  const embedding = await generateEmbedding(memory.summary);

  d.prepare('DELETE FROM vec_memories WHERE path = ?').run(memory.path);

  d.prepare(`
    INSERT INTO vec_memories(path, title, summary, tags, created, modified, summary_embedding)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    memory.path,
    memory.title,
    memory.summary,
    JSON.stringify(memory.tags),
    memory.created,
    memory.modified,
    new Float32Array(embedding),
  );

  logger.info('Upserted memory', { path: memory.path, dimensions: embedding.length });
}

export async function searchMemories(
  query: string,
  options: { limit?: number } = {},
): Promise<SearchResult[]> {
  logger.debug('Searching memories', { query: query.substring(0, 80), options });

  ensureTable();
  const d = getDb();
  const { limit = 5 } = options;

  try {
    const embedding = await generateEmbedding(query);
    const rows = d.prepare(`
      SELECT path, title, summary, tags, created, modified, distance
      FROM vec_memories
      WHERE summary_embedding MATCH ?
      ORDER BY distance
      LIMIT ?
    `).all(new Float32Array(embedding), limit) as Array<{
      path: string;
      title: string;
      summary: string;
      tags: string;
      created: string;
      modified: string;
      distance: number;
    }>;

    logger.debug('Search results', { count: rows.length });

    return rows.map((r) => ({
      path: r.path,
      title: r.title,
      summary: r.summary || '',
      tags: JSON.parse(r.tags || '[]') as string[],
      score: Math.round(Math.max(0, 1 - r.distance) * 100) / 100,
    }));
  } catch (e) {
    logger.error('SQLite search failed', { error: (e as Error).message });
    return [];
  }
}

export async function deleteMemory(relativePath: string): Promise<void> {
  logger.info('Deleting memory from SQLite', { path: relativePath });
  ensureTable();
  const d = getDb();
  d.prepare('DELETE FROM vec_memories WHERE path = ?').run(relativePath);
}

export async function getAllTags(): Promise<string[]> {
  ensureTable();
  const d = getDb();
  const rows = d.prepare('SELECT DISTINCT tags FROM vec_memories').all() as Array<{ tags: string }>;
  const tagSet = new Set<string>();
  for (const row of rows) {
    try {
      const parsed = JSON.parse(row.tags || '[]') as string[];
      for (const t of parsed) tagSet.add(t);
    } catch { /* skip */ }
  }
  return [...tagSet].sort();
}

export async function getRecentMemories(limit = 10): Promise<SearchResult[]> {
  ensureTable();
  const d = getDb();
  const rows = d.prepare(`
    SELECT path, title, tags, created, modified
    FROM vec_memories
    ORDER BY modified DESC
    LIMIT ?
  `).all(limit) as Array<{
    path: string;
    title: string;
    tags: string;
    created: string;
    modified: string;
  }>;

  return rows.map((r) => ({
    path: r.path,
    title: r.title,
    summary: '',
    tags: JSON.parse(r.tags || '[]') as string[],
    score: 1.0,
  }));
}

export async function clearCollection(): Promise<void> {
  logger.info('Clearing SQLite vector table');
  const d = getDb();
  d.exec('DROP TABLE IF EXISTS vec_memories');
  ensureTable();
  logger.info('SQLite vector table recreated');
}

export async function rebuildIndex(
  onProgress?: (done: number, total: number) => void,
): Promise<IndexResult> {
  const files = getAllMemoryFiles();
  let indexed = 0;
  let errors = 0;

  logger.info('Rebuilding SQLite index', { fileCount: files.length });

  clearCollection();

  for (let i = 0; i < files.length; i++) {
    try {
      const memory = readMemoryFile(files[i]);
      if (memory && memory.summary) {
        await upsertMemory(memory);
        indexed++;
      } else {
        logger.warn('Skipping file (no summary)', { path: files[i] });
        console.error(`  ⚠ Skipping ${files[i]} (no summary)`);
      }
    } catch (e) {
      logger.error('Error indexing file', { path: files[i], error: (e as Error).message });
      console.error(`  ✗ Error indexing ${files[i]}: ${(e as Error).message}`);
      errors++;
    }

    if (onProgress) onProgress(i + 1, files.length);
  }

  logger.info('Index rebuild complete', { indexed, errors });
  return { indexed, errors };
}

export async function getMemoryCount(): Promise<number> {
  ensureTable();
  const d = getDb();
  const row = d.prepare('SELECT COUNT(*) as cnt FROM vec_memories').get() as { cnt: number };
  return row.cnt;
}
