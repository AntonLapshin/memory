import { QdrantClient } from '@qdrant/js-client-rest';
import { loadConfig, getAllMemoryFiles } from './config.js';
import { readMemoryFile } from './memory-file.js';
import { generateEmbedding } from './embeddings.js';
let client = null;
function getClient() {
    if (client)
        return client;
    const config = loadConfig();
    client = new QdrantClient({ url: config.qdrant.url });
    return client;
}
export async function ensureCollection() {
    const config = loadConfig();
    const c = getClient();
    const { collection } = config.qdrant;
    const { embedding } = config;
    try {
        const collections = await c.getCollections();
        const exists = collections.collections.some((col) => col.name === collection);
        if (!exists) {
            await c.createCollection(collection, {
                vectors: {
                    size: embedding.dimensions,
                    distance: 'Cosine',
                },
            });
        }
    }
    catch (e) {
        throw new Error(`Failed to connect to Qdrant at ${config.qdrant.url}: ${e.message}`);
    }
}
export async function isQdrantReachable() {
    try {
        const c = getClient();
        await c.getCollections();
        return true;
    }
    catch {
        return false;
    }
}
export async function upsertMemory(memory) {
    const config = loadConfig();
    const c = getClient();
    const embedding = await generateEmbedding(memory.summary);
    const id = memory.path;
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
export async function searchMemories(query, options = {}) {
    const config = loadConfig();
    const c = getClient();
    const { limit = 5, tags } = options;
    const embedding = await generateEmbedding(query);
    const searchParams = {
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
    const results = await c.search(config.qdrant.collection, searchParams);
    return results.map((r) => ({
        path: r.payload?.file_path || '',
        title: r.payload?.title || '',
        summary: r.payload?.summary || '',
        tags: r.payload?.tags || [],
        score: r.score || 0,
    }));
}
export async function findDuplicates(summary, threshold = 0.95) {
    const results = await searchMemories(summary, { limit: 3 });
    return results.filter((r) => r.score >= threshold);
}
export async function deleteMemory(relativePath) {
    const config = loadConfig();
    const c = getClient();
    await c.delete(config.qdrant.collection, {
        wait: true,
        points: [relativePath],
    });
}
export async function getAllTags() {
    const config = loadConfig();
    const c = getClient();
    try {
        const tags = new Set();
        let offset = null;
        do {
            const result = await c.scroll(config.qdrant.collection, {
                with_payload: ['tags'],
                limit: 100,
                offset: offset ?? undefined,
            });
            for (const point of result.points) {
                const payloadTags = point.payload?.tags;
                if (Array.isArray(payloadTags)) {
                    for (const tag of payloadTags) {
                        if (typeof tag === 'string')
                            tags.add(tag);
                    }
                }
            }
            offset = result.next_page_offset ?? null;
        } while (offset);
        return [...tags].sort();
    }
    catch {
        return [];
    }
}
export async function getRecentMemories(limit = 10) {
    const config = loadConfig();
    const c = getClient();
    try {
        const result = await c.scroll(config.qdrant.collection, {
            with_payload: true,
            limit,
        });
        return result.points
            .map((p) => {
            const payload = p.payload;
            return {
                path: payload?.file_path || '',
                title: payload?.title || '',
                summary: payload?.summary || '',
                tags: payload?.tags || [],
                score: 1.0,
            };
        })
            .sort((a, b) => {
            // sort by path as fallback since modified isn't in the result
            return a.path.localeCompare(b.path);
        });
    }
    catch {
        return [];
    }
}
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
            }
            else {
                console.error(`  ⚠ Skipping ${files[i]} (no summary)`);
            }
        }
        catch (e) {
            console.error(`  ✗ Error indexing ${files[i]}: ${e.message}`);
            errors++;
        }
        if (onProgress)
            onProgress(i + 1, files.length);
    }
    return { indexed, errors };
}
//# sourceMappingURL=qdrant.js.map