/**
 * Qdrant vector database operations
 */
import { QdrantClient } from '@qdrant/js-client-rest';
import { loadConfig, getAllMemoryFiles } from './config.js';
import { readMemoryFile } from './memory-file.js';
import { generateEmbedding, generateEmbeddingsBatch } from './embeddings.js';

/** @type {QdrantClient | null} */
let client = null;

/**
 * Get or create Qdrant client
 * @returns {QdrantClient}
 */
function getClient() {
  if (client) return client;

  const config = loadConfig();
  client = new QdrantClient({ url: config.qdrant.url });
  return client;
}

/**
 * Ensure the memories collection exists
 * @returns {Promise<void>}
 */
export async function ensureCollection() {
  const config = loadConfig();
  const c = getClient();
  const { collection, embedding } = config;

  try {
    const collections = await c.getCollections();
    const exists = collections.collections.some(
      (col) => col.name === collection
    );

    if (!exists) {
      await c.createCollection(collection, {
        vectors: {
          size: embedding.dimensions,
          distance: 'Cosine',
        },
      });
    }
  } catch (e) {
    throw new Error(
      `Failed to connect to Qdrant at ${config.qdrant.url}: ${e.message}`
    );
  }
}

/**
 * Check if Qdrant is reachable
 * @returns {Promise<boolean>}
 */
export async function isQdrantReachable() {
  try {
    const c = getClient();
    await c.getCollections();
    return true;
  } catch {
    return false;
  }
}

/**
 * Upsert a memory into Qdrant
 * @param {import('./types.js').MemoryFile} memory
 * @returns {Promise<string>} Point ID
 */
export async function upsertMemory(memory) {
  const config = loadConfig();
  const c = getClient();
  const embedding = await generateEmbedding(memory.summary);

  const id = memory.path; // Use path as deterministic ID
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

  return id;
}

/**
 * Search memories by vector similarity
 * @param {string} query
 * @param {Object} [options]
 * @param {number} [options.limit=5]
 * @param {string[]} [options.tags]
 * @returns {Promise<import('./types.js').SearchResult[]>}
 */
export async function searchMemories(query, options = {}) {
  const config = loadConfig();
  const c = getClient();
  const { limit = 5, tags } = options;
  const embedding = await generateEmbedding(query);

  /** @type {any} */
  const searchParams = {
    vector: embedding,
    limit,
    with_payload: true,
    score_threshold: 0.3,
  };

  if (tags && tags.length > 0) {
    searchParams.filter = {
      must: tags.map(tag => ({
        key: 'tags',
        match: { value: tag },
      })),
    };
  }

  const results = await c.search(config.qdrant.collection, searchParams);

  return results.map((r) => ({
    path: r.payload?.file_path || '',
    title: r.payload?.title || '',
    summary: r.payload?.summary || '',
    tags: r.payload?.tags || [],
    score: r.score || 0,
  }));
}

/**
 * Check for near-duplicate memories
 * @param {string} summary
 * @param {number} [threshold=0.95]
 * @returns {Promise<import('./types.js').SearchResult[]>}
 */
export async function findDuplicates(summary, threshold = 0.95) {
  const results = await searchMemories(summary, { limit: 3 });
  return results.filter((r) => r.score >= threshold);
}

/**
 * Delete a memory from Qdrant by path
 * @param {string} relativePath
 * @returns {Promise<void>}
 */
export async function deleteMemory(relativePath) {
  const config = loadConfig();
  const c = getClient();
  await c.delete(config.qdrant.collection, {
    wait: true,
    points: [relativePath],
  });
}

/**
 * Get all unique tags from Qdrant
 * @returns {Promise<string[]>}
 */
export async function getAllTags() {
  const config = loadConfig();
  const c = getClient();

  try {
    // Scroll through all points to collect tags
    const tags = new Set();
    let offset = null;

    do {
      const result = await c.scroll(config.qdrant.collection, {
        with_payload: ['tags'],
        limit: 100,
        offset: offset,
      });

      for (const point of result.points) {
        if (point.payload?.tags) {
          for (const tag of point.payload.tags) {
            tags.add(tag);
          }
        }
      }

      offset = result.next_page_offset;
    } while (offset);

    return [...tags].sort();
  } catch {
    return [];
  }
}

/**
 * Get recently modified memories
 * @param {number} [limit=10]
 * @returns {Promise<import('./types.js').SearchResult[]>}
 */
export async function getRecentMemories(limit = 10) {
  const config = loadConfig();
  const c = getClient();

  try {
    const result = await c.scroll(config.qdrant.collection, {
      with_payload: true,
      limit,
    });

    return result.points
      .map((p) => ({
        path: p.payload?.file_path || '',
        title: p.payload?.title || '',
        summary: p.payload?.summary || '',
        tags: p.payload?.tags || [],
        score: 1.0,
      }))
      .sort((a, b) => {
        const aMod = a.modified || '';
        const bMod = b.modified || '';
        return bMod.localeCompare(aMod);
      });
  } catch {
    return [];
  }
}

/**
 * Rebuild the entire Qdrant index from .md files
 * @param {function(number, number): void} [onProgress]
 * @returns {Promise<{indexed: number, errors: number}>}
 */
export async function rebuildIndex(onProgress) {
  const files = getAllMemoryFiles();
  let indexed = 0;
  let errors = 0;

  for (let i = 0; i < files.length; i++) {
    try {
      const memory = readMemoryFile(files[i]);
      if (memory && memory.summary) {
        await upsertMemory(memory);
        indexed++;
      } else {
        console.error(`  ⚠ Skipping ${files[i]} (no summary)`);
      }
    } catch (e) {
      console.error(`  ✗ Error indexing ${files[i]}: ${e.message}`);
      errors++;
    }

    if (onProgress) onProgress(i + 1, files.length);
  }

  return { indexed, errors };
}
