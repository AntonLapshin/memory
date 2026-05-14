import { QdrantClient } from '@qdrant/js-client-rest';
import { loadConfig, getAllMemoryFiles } from './config.js';
import { readMemoryFile } from './memory-file.js';
import { generateEmbedding } from './embeddings.js';
import { logger } from './logger.js';
import type { MemoryFile, SearchResult, IndexResult } from './types.js';

let client: QdrantClient | null = null;
let collectionEnsured = false;
let cachedDimensions: number | null = null;

function getClient(): QdrantClient {
  if (client) return client;
  const config = loadConfig();
  client = new QdrantClient({ url: config.qdrant.url });
  return client;
}

export async function ensureCollection(): Promise<void> {
  if (collectionEnsured) return;

  const config = loadConfig();
  const c = getClient();
  const { collection } = config.qdrant;
  const dimensions = cachedDimensions || config.embedding.dimensions;

  logger.debug('Ensuring Qdrant collection', { collection, dimensions });

  try {
    const collections = await c.getCollections();
    const existing = collections.collections.find((col) => col.name === collection);

    if (!existing) {
      logger.info('Creating Qdrant collection', { collection, dimensions });
      await c.createCollection(collection, {
        vectors: {
          size: dimensions,
          distance: 'Cosine',
        },
      });
    }

    collectionEnsured = true;
  } catch (e) {
    logger.error('Failed to connect to Qdrant', { url: config.qdrant.url, error: (e as Error).message });
    throw new Error(
      `Failed to connect to Qdrant at ${config.qdrant.url}: ${(e as Error).message}`,
    );
  }
}

export function resetCollectionCache(): void {
  collectionEnsured = false;
  cachedDimensions = null;
}

export async function isQdrantReachable(): Promise<boolean> {
  try {
    const c = getClient();
    await c.getCollections();
    return true;
  } catch {
    return false;
  }
}

async function detectDimensions(embedding: number[]): Promise<void> {
  if (cachedDimensions === embedding.length) return;

  const config = loadConfig();
  const c = getClient();
  const { collection } = config.qdrant;

  if (cachedDimensions !== null && cachedDimensions !== embedding.length) {
    // Dimensions changed, recreate collection
    logger.warn('Embedding dimensions changed, recreating collection', {
      old: cachedDimensions,
      new: embedding.length,
    });
    try {
      await c.deleteCollection(collection);
    } catch {
      // collection might not exist
    }
    collectionEnsured = false;
  }

  cachedDimensions = embedding.length;

  // Update config if dimensions differ
  if (config.embedding.dimensions !== embedding.length) {
    config.embedding.dimensions = embedding.length;
    const { saveConfig } = await import('./config.js');
    saveConfig(config);
    logger.info('Updated embedding dimensions in config', { dimensions: embedding.length });
  }

  // Re-ensure collection with correct dimensions
  collectionEnsured = false;
  await ensureCollection();
}

export async function upsertMemory(memory: MemoryFile): Promise<string> {
  logger.info('Upserting memory to Qdrant', { path: memory.path });

  await ensureCollection();
  const config = loadConfig();
  const c = getClient();
  const embedding = await generateEmbedding(memory.summary);

  await detectDimensions(embedding);

  const id = memory.path;
  try {
    await c.upsert(config.qdrant.collection, {
      wait: true,
      points: [
        {
          id,
          vector: embedding,
          payload: {
            file_path: memory.path,
            title: memory.title,
            summary: memory.summary,
            tags: memory.tags,
            created: memory.created,
            modified: memory.modified,
          },
        },
      ],
    });
    logger.info('Upserted memory', { id, dimensions: embedding.length });
  } catch (e) {
    logger.error('Qdrant upsert failed', { id, error: (e as Error).message });
    throw new Error(`Failed to upsert memory to Qdrant: ${(e as Error).message}`);
  }

  return id;
}

export async function searchMemories(
  query: string,
  options: { limit?: number; tags?: string[] } = {},
): Promise<SearchResult[]> {
  logger.debug('Searching memories', { query: query.substring(0, 80), options });

  await ensureCollection();
  const config = loadConfig();
  const c = getClient();
  const { limit = 5, tags } = options;

  try {
    const embedding = await generateEmbedding(query);
    await detectDimensions(embedding);

    const searchParams: Record<string, unknown> = {
      vector: embedding,
      limit,
      with_payload: true,
      score_threshold: 0.3,
    };

    if (tags && tags.length > 0) {
      searchParams.filter = {
        must: tags.map((tag) => ({
          key: 'tags',
          match: { value: tag },
        })),
      };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const results = await c.search(config.qdrant.collection, searchParams as any);

    logger.debug('Search results', { count: results.length });

    return results.map((r) => ({
      path: (r.payload as Record<string, unknown> | null)?.file_path as string || '',
      title: (r.payload as Record<string, unknown> | null)?.title as string || '',
      summary: (r.payload as Record<string, unknown> | null)?.summary as string || '',
      tags: (r.payload as Record<string, unknown> | null)?.tags as string[] || [],
      score: r.score || 0,
    }));
  } catch (e) {
    logger.error('Qdrant search failed', { error: (e as Error).message });
    return [];
  }
}

export async function findDuplicates(
  summary: string,
  threshold = 0.95,
): Promise<SearchResult[]> {
  const results = await searchMemories(summary, { limit: 3 });
  return results.filter((r) => r.score >= threshold);
}

export async function deleteMemory(relativePath: string): Promise<void> {
  logger.info('Deleting memory from Qdrant', { path: relativePath });
  await ensureCollection();
  const config = loadConfig();
  const c = getClient();
  try {
    await c.delete(config.qdrant.collection, {
      wait: true,
      points: [relativePath],
    });
  } catch (e) {
    logger.error('Qdrant delete failed', { path: relativePath, error: (e as Error).message });
  }
}

export async function getAllTags(): Promise<string[]> {
  await ensureCollection();
  const config = loadConfig();
  const c = getClient();

  try {
    const tags = new Set<string>();
    let offset: string | number | null = null;

    do {
      const result = await c.scroll(config.qdrant.collection, {
        with_payload: ['tags'],
        limit: 100,
        offset: offset ?? undefined,
      });

      for (const point of result.points) {
        const payloadTags = (point.payload as Record<string, unknown> | null)?.tags;
        if (Array.isArray(payloadTags)) {
          for (const tag of payloadTags) {
            if (typeof tag === 'string') tags.add(tag);
          }
        }
      }

      offset = (result.next_page_offset as string | number | null) ?? null;
    } while (offset);

    return [...tags].sort();
  } catch (e) {
    logger.error('Failed to get tags from Qdrant', { error: (e as Error).message });
    return [];
  }
}

export async function getRecentMemories(limit = 10): Promise<SearchResult[]> {
  await ensureCollection();
  const config = loadConfig();
  const c = getClient();

  try {
    const result = await c.scroll(config.qdrant.collection, {
      with_payload: true,
      limit,
    });

    return result.points
      .map((p) => {
        const payload = p.payload as Record<string, unknown> | null;
        return {
          path: payload?.file_path as string || '',
          title: payload?.title as string || '',
          summary: payload?.summary as string || '',
          tags: payload?.tags as string[] || [],
          score: 1.0,
        };
      })
      .sort((a, b) => a.path.localeCompare(b.path));
  } catch (e) {
    logger.error('Failed to get recent memories', { error: (e as Error).message });
    return [];
  }
}

export async function rebuildIndex(
  onProgress?: (done: number, total: number) => void,
): Promise<IndexResult> {
  const files = getAllMemoryFiles();
  let indexed = 0;
  let errors = 0;

  logger.info('Rebuilding Qdrant index', { fileCount: files.length });

  // Reset collection to ensure fresh dimensions
  resetCollectionCache();

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
