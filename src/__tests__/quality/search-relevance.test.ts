import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createTempDir, cleanupTempDir, initTestConfig } from '../helpers/temp-dir.js';
import {
  deterministicEmbedding,
  embeddingWithSimilarity,
  predictedScore,
} from '../helpers/embedding-mock.js';

let tmpDir: string;
let memoryDir: string;

vi.mock('../../embeddings.js', () => {
  const embeddingMap = new Map<string, number[]>();
  return {
    generateEmbedding: vi.fn(async (text: string): Promise<number[]> => {
      const stored = embeddingMap.get(text);
      if (stored) return [...stored];
      const hash = text.split('').reduce((h, c) => h * 31 + c.charCodeAt(0), 0);
      return deterministicEmbedding(hash);
    }),
    checkOllamaHealth: vi.fn(),
    generateEmbeddingsBatch: vi.fn(),
    _setEmbedding: (text: string, vec: number[]) => {
      embeddingMap.set(text, vec);
    },
    _clearEmbeddings: () => {
      embeddingMap.clear();
    },
  };
});

beforeEach(async () => {
  tmpDir = createTempDir();
  memoryDir = initTestConfig(tmpDir);
  vi.clearAllMocks();

  const { setMemoryRoot } = await import('../../config.js');
  setMemoryRoot(memoryDir);
});

afterEach(async () => {
  try {
    const { closeDb } = await import('../../vector-db.js');
    closeDb();
  } catch { /* db may not be open */ }
  cleanupTempDir(tmpDir);
});

describe('search relevance quality', () => {
  it('ranks highly similar content above moderately similar content', async () => {
    const { ensureTable, upsertMemory, searchMemories } = await import('../../vector-db.js');
    const embeddings = await import('../../embeddings.js');
    ensureTable();

    const queryVec = deterministicEmbedding(42);

    const similarities = [0.9, 0.7, 0.5, 0.3];
    const memoryLabels = similarities.map((sim, i) => `memory-cos${sim * 100}-${i}`);

    for (let i = 0; i < similarities.length; i++) {
      const vec = embeddingWithSimilarity(queryVec, similarities[i], i * 100);
      embeddings._setEmbedding(memoryLabels[i], vec);

      await upsertMemory({
        path: `test/quality-${i}.md`,
        title: `Quality Memory ${i}`,
        summary: memoryLabels[i],
        tags: ['quality-test'],
        created: '2025-01-01T00:00:00.000Z',
        modified: '2025-01-01T00:00:00.000Z',
        content: `# Quality ${i}`,
        raw: `---\ntitle: Quality Memory ${i}\n---\n\n# Quality ${i}`,
      });
    }

    embeddings._setEmbedding('search quality test query', queryVec);

    const results = await searchMemories('search quality test query', { limit: 4 });

    expect(results).toHaveLength(4);
    expect(results[0].path).toBe('test/quality-0.md');

    for (let i = 0; i < results.length - 1; i++) {
      expect(
        results[i].score,
        `Result ${i} (path=${results[i].path}, score=${results[i].score}) should score >= result ${i + 1} (path=${results[i + 1].path}, score=${results[i + 1].score})`,
      ).toBeGreaterThanOrEqual(results[i + 1].score);
    }

    const highScore = results[0].score;
    expect(
      highScore,
      `Memory with cos_sim=0.9 should score well above 0.03 (got ${highScore})`,
    ).toBeGreaterThan(0.20);
  });

  it('scores diminish as cosine similarity decreases', async () => {
    const { ensureTable, upsertMemory, searchMemories } = await import('../../vector-db.js');
    const embeddings = await import('../../embeddings.js');
    ensureTable();

    const queryVec = deterministicEmbedding(77);

    const similarities = [0.95, 0.8, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1];
    const labels = similarities.map((sim, i) => `curve-${sim}-${i}`);

    for (let i = 0; i < similarities.length; i++) {
      const vec = embeddingWithSimilarity(queryVec, similarities[i], i * 50);
      embeddings._setEmbedding(labels[i], vec);

      await upsertMemory({
        path: `test/curve-${i}.md`,
        title: `Curve ${i}`,
        summary: labels[i],
        tags: ['curve-test'],
        created: '2025-01-01T00:00:00.000Z',
        modified: '2025-01-01T00:00:00.000Z',
        content: `# Curve ${i}`,
        raw: `---\ntitle: Curve ${i}\n---\n\n# Curve ${i}`,
      });
    }

    embeddings._setEmbedding('curve search query', queryVec);

    const results = await searchMemories('curve search query', { limit: 8 });

    expect(results).toHaveLength(8);

    for (let i = 0; i < results.length - 1; i++) {
      expect(results[i].score).toBeGreaterThanOrEqual(results[i + 1].score);
    }

    const topScore = results[0].score;
    const bottomScore = results[results.length - 1].score;
    const spread = topScore - bottomScore;

    expect(
      spread,
      `Score spread should be meaningful (top=${topScore}, bottom=${bottomScore}, spread=${spread})`,
    ).toBeGreaterThan(0.10);
  });

  it('should score semantically unrelated content very low', async () => {
    const { ensureTable, upsertMemory, searchMemories } = await import('../../vector-db.js');
    const embeddings = await import('../../embeddings.js');
    ensureTable();

    const queryVec = deterministicEmbedding(55);

    const relatedVec = embeddingWithSimilarity(queryVec, 0.9, 10);
    embeddings._setEmbedding('react component state hooks', relatedVec);

    const unrelatedVec = embeddingWithSimilarity(queryVec, 0.05, 20);
    embeddings._setEmbedding('italian pasta carbonara recipe', unrelatedVec);

    await upsertMemory({
      path: 'tech/react-hooks.md',
      title: 'React Hooks',
      summary: 'react component state hooks',
      tags: ['react', 'frontend'],
      created: '2025-01-01T00:00:00.000Z',
      modified: '2025-01-01T00:00:00.000Z',
      content: '# React Hooks',
      raw: '---\ntitle: React Hooks\n---\n\n# React Hooks',
    });

    await upsertMemory({
      path: 'food/pasta.md',
      title: 'Pasta Carbonara',
      summary: 'italian pasta carbonara recipe',
      tags: ['cooking', 'italian'],
      created: '2025-01-01T00:00:00.000Z',
      modified: '2025-01-01T00:00:00.000Z',
      content: '# Pasta',
      raw: '---\ntitle: Pasta Carbonara\n---\n\n# Pasta',
    });

    embeddings._setEmbedding('how to manage state in react', queryVec);

    const results = await searchMemories('how to manage state in react', { limit: 2 });

    expect(results).toHaveLength(2);
    expect(results[0].path).toBe('tech/react-hooks.md');
    expect(results[0].score).toBeGreaterThan(results[1].score);

    expect(
      results[1].score,
      `Unrelated memory score (${results[1].score}) should be very low`,
    ).toBeLessThan(0.15);
  });

  it('near-identical content should score above 0.30', async () => {
    const { ensureTable, upsertMemory, searchMemories } = await import('../../vector-db.js');
    const embeddings = await import('../../embeddings.js');
    ensureTable();

    const queryVec = deterministicEmbedding(99);

    const nearIdenticalVec = embeddingWithSimilarity(queryVec, 0.95, 1);
    embeddings._setEmbedding('react useState hook usage explained in detail', nearIdenticalVec);

    await upsertMemory({
      path: 'tech/react-hooks-detailed.md',
      title: 'React Hooks Explained',
      summary: 'react useState hook usage explained in detail',
      tags: ['react'],
      created: '2025-01-01T00:00:00.000Z',
      modified: '2025-01-01T00:00:00.000Z',
      content: '# React Hooks',
      raw: '---\ntitle: React Hooks Explained\n---\n\n# React Hooks',
    });

    embeddings._setEmbedding('useState react hook utilization details', queryVec);

    const results = await searchMemories('useState react hook utilization details', { limit: 1 });

    expect(results).toHaveLength(1);

    expect(
      results[0].score,
      `Near-identical content (cos_sim=0.95) should score above 0.30 (got ${results[0].score})`,
    ).toBeGreaterThan(0.30);
  });

  it('score follows predicted formula: max(0, 1 - L2)', async () => {
    const { ensureTable, upsertMemory, searchMemories } = await import('../../vector-db.js');
    const embeddings = await import('../../embeddings.js');
    ensureTable();

    const queryVec = deterministicEmbedding(33);

    const vec = embeddingWithSimilarity(queryVec, 0.85, 42);
    embeddings._setEmbedding('formula test memory', vec);

    await upsertMemory({
      path: 'test/formula.md',
      title: 'Formula Test',
      summary: 'formula test memory',
      tags: ['test'],
      created: '2025-01-01T00:00:00.000Z',
      modified: '2025-01-01T00:00:00.000Z',
      content: '# Test',
      raw: '---\ntitle: Formula Test\n---\n\n# Test',
    });

    embeddings._setEmbedding('formula test query', queryVec);

    const results = await searchMemories('formula test query', { limit: 1 });

    expect(results).toHaveLength(1);

    const expectedScore = predictedScore(0.85);
    expect(
      results[0].score,
      `Score ${results[0].score} should match predicted ${expectedScore} for cos_sim=0.85`,
    ).toBeCloseTo(expectedScore, 0);
  });
});

describe('score edge cases', () => {
  it('identical vectors (cos_sim=1.0) should score exactly 1.0', async () => {
    const { ensureTable, upsertMemory, searchMemories } = await import('../../vector-db.js');
    const embeddings = await import('../../embeddings.js');
    ensureTable();

    const vec = deterministicEmbedding(123);
    embeddings._setEmbedding('identical summary', vec);
    embeddings._setEmbedding('identical query', vec);

    await upsertMemory({
      path: 'test/identical.md',
      title: 'Identical Test',
      summary: 'identical summary',
      tags: ['test'],
      created: '2025-01-01T00:00:00.000Z',
      modified: '2025-01-01T00:00:00.000Z',
      content: '# Test',
      raw: '---\ntitle: Identical Test\n---\n\n# Test',
    });

    const results = await searchMemories('identical query', { limit: 1 });

    expect(results).toHaveLength(1);
    expect(results[0].score).toBe(1.0);
  });

  it('empty database returns empty results', async () => {
    const { ensureTable, searchMemories } = await import('../../vector-db.js');
    const embeddings = await import('../../embeddings.js');
    ensureTable();

    const vec = deterministicEmbedding(999);
    embeddings._setEmbedding('empty query', vec);

    const results = await searchMemories('empty query', { limit: 10 });
    expect(results).toEqual([]);
  });
});
