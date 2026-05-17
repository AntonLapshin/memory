import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { setMemoryRoot, getVaultRoot } from '../../config.js';
import { createTempDir, cleanupTempDir, initTestConfig } from '../helpers/temp-dir.js';
import { deterministicEmbedding, embeddingWithSimilarity } from '../helpers/embedding-mock.js';

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

beforeEach(() => {
  tmpDir = createTempDir();
  memoryDir = initTestConfig(tmpDir);
});

afterEach(async () => {
  try {
    const { closeDb } = await import('../../vector-db.js');
    closeDb();
  } catch { /* db may not be open */ }
  cleanupTempDir(tmpDir);
  vi.clearAllMocks();
});

describe('vector-db', () => {
  describe('ensureTable', () => {
    it('should create vec_memories table', async () => {
      setMemoryRoot(memoryDir);
      const { ensureTable, getMemoryCount } = await import('../../vector-db.js');

      ensureTable();
      const count = await getMemoryCount();
      expect(count).toBe(0);
    });

    it('should be idempotent', async () => {
      setMemoryRoot(memoryDir);
      const { ensureTable, getMemoryCount } = await import('../../vector-db.js');

      ensureTable();
      ensureTable();
      ensureTable();
      const count = await getMemoryCount();
      expect(count).toBe(0);
    });
  });

  describe('upsertMemory', () => {
    it('should insert a memory into the database', async () => {
      setMemoryRoot(memoryDir);
      const { ensureTable, upsertMemory, getMemoryCount } = await import('../../vector-db.js');
      const embeddings = await import('../../embeddings.js');

      const baseVec = deterministicEmbedding(42);
      (embeddings._setEmbedding as (t: string, v: number[]) => void)('summary-A', baseVec);

      ensureTable();
      await upsertMemory({
        path: 'test/memory-a.md',
        title: 'Memory A',
        summary: 'summary-A',
        tags: ['test', 'alpha'],
        created: '2025-01-01T00:00:00.000Z',
        modified: '2025-01-01T00:00:00.000Z',
        content: '# Memory A\n\nContent A.',
        raw: '---\ntitle: Memory A\n---\n\n# Memory A\n\nContent A.',
      });

      const count = await getMemoryCount();
      expect(count).toBe(1);
    });

    it('should update an existing memory (same path)', async () => {
      setMemoryRoot(memoryDir);
      const { ensureTable, upsertMemory, getMemoryCount } = await import('../../vector-db.js');
      const embeddings = await import('../../embeddings.js');

      const baseVec = deterministicEmbedding(42);
      (embeddings._setEmbedding as (t: string, v: number[]) => void)('summary-old', baseVec);
      (embeddings._setEmbedding as (t: string, v: number[]) => void)('summary-new', baseVec);

      ensureTable();
      await upsertMemory({
        path: 'update-me.md',
        title: 'Old Title',
        summary: 'summary-old',
        tags: ['old'],
        created: '2025-01-01T00:00:00.000Z',
        modified: '2025-01-01T00:00:00.000Z',
        content: 'Old content.',
        raw: '---\ntitle: Old Title\n---\n\nOld content.',
      });

      await upsertMemory({
        path: 'update-me.md',
        title: 'New Title',
        summary: 'summary-new',
        tags: ['new'],
        created: '2025-01-01T00:00:00.000Z',
        modified: '2025-01-02T00:00:00.000Z',
        content: 'New content.',
        raw: '---\ntitle: New Title\n---\n\nNew content.',
      });

      const count = await getMemoryCount();
      expect(count).toBe(1);
    });
  });

  describe('searchMemories', () => {
    it('should return empty array when no memories exist', async () => {
      setMemoryRoot(memoryDir);
      const { ensureTable, searchMemories } = await import('../../vector-db.js');

      ensureTable();
      const results = await searchMemories('anything');
      expect(results).toEqual([]);
    });

    it('should return results ordered by relevance', async () => {
      setMemoryRoot(memoryDir);
      const { ensureTable, upsertMemory, searchMemories } = await import('../../vector-db.js');
      const embeddings = await import('../../embeddings.js');
      ensureTable();

      const queryVec = deterministicEmbedding(100);
      (embeddings._setEmbedding as (t: string, v: number[]) => void)('semantic search about react', queryVec);

      const relatedVec = embeddingWithSimilarity(queryVec, 0.8, 1);
      (embeddings._setEmbedding as (t: string, v: number[]) => void)('react hooks summary', relatedVec);

      const somewhatVec = embeddingWithSimilarity(queryVec, 0.5, 2);
      (embeddings._setEmbedding as (t: string, v: number[]) => void)('general frontend summary', somewhatVec);

      const unrelatedVec = embeddingWithSimilarity(queryVec, 0.1, 3);
      (embeddings._setEmbedding as (t: string, v: number[]) => void)('cooking pasta summary', unrelatedVec);

      await upsertMemory({
        path: 'tech/react.md',
        title: 'React Hooks',
        summary: 'react hooks summary',
        tags: ['react'],
        created: '2025-01-01T00:00:00.000Z',
        modified: '2025-01-01T00:00:00.000Z',
        content: '# React',
        raw: '---\ntitle: React Hooks\n---\n\n# React',
      });

      await upsertMemory({
        path: 'tech/frontend.md',
        title: 'Frontend Basics',
        summary: 'general frontend summary',
        tags: ['frontend'],
        created: '2025-01-01T00:00:00.000Z',
        modified: '2025-01-01T00:00:00.000Z',
        content: '# Frontend',
        raw: '---\ntitle: Frontend Basics\n---\n\n# Frontend',
      });

      await upsertMemory({
        path: 'food/pasta.md',
        title: 'Pasta Recipe',
        summary: 'cooking pasta summary',
        tags: ['cooking'],
        created: '2025-01-01T00:00:00.000Z',
        modified: '2025-01-01T00:00:00.000Z',
        content: '# Pasta',
        raw: '---\ntitle: Pasta Recipe\n---\n\n# Pasta',
      });

      const results = await searchMemories('semantic search about react', { limit: 3 });

      expect(results).toHaveLength(3);
      expect(results[0].path).toBe('tech/react.md');
      expect(results[0].score).toBeGreaterThanOrEqual(results[1].score);
      expect(results[1].score).toBeGreaterThanOrEqual(results[2].score);
    });

    it('should respect limit option', async () => {
      setMemoryRoot(memoryDir);
      const { ensureTable, upsertMemory, searchMemories } = await import('../../vector-db.js');
      const embeddings = await import('../../embeddings.js');
      ensureTable();

      const queryVec = deterministicEmbedding(200);
      (embeddings._setEmbedding as (t: string, v: number[]) => void)('query limit test', queryVec);

      for (let i = 0; i < 5; i++) {
        const vec = embeddingWithSimilarity(queryVec, 0.7, i + 10);
        (embeddings._setEmbedding as (t: string, v: number[]) => void)(`summary-${i}`, vec);
        await upsertMemory({
          path: `test/mem-${i}.md`,
          title: `Memory ${i}`,
          summary: `summary-${i}`,
          tags: ['test'],
          created: '2025-01-01T00:00:00.000Z',
          modified: '2025-01-01T00:00:00.000Z',
          content: `# Memory ${i}`,
          raw: `---\ntitle: Memory ${i}\n---\n\n# Memory ${i}`,
        });
      }

      const results = await searchMemories('query limit test', { limit: 2 });
      expect(results).toHaveLength(2);
    });
  });

  describe('deleteMemory', () => {
    it('should remove a memory from the database', async () => {
      setMemoryRoot(memoryDir);
      const { ensureTable, upsertMemory, deleteMemory, getMemoryCount } = await import('../../vector-db.js');
      const embeddings = await import('../../embeddings.js');

      const vec = deterministicEmbedding(300);
      (embeddings._setEmbedding as (t: string, v: number[]) => void)('to delete', vec);

      ensureTable();
      await upsertMemory({
        path: 'delete-me.md',
        title: 'Delete Me',
        summary: 'to delete',
        tags: ['test'],
        created: '2025-01-01T00:00:00.000Z',
        modified: '2025-01-01T00:00:00.000Z',
        content: '# Delete',
        raw: '---\ntitle: Delete Me\n---\n\n# Delete',
      });

      expect(await getMemoryCount()).toBe(1);

      await deleteMemory('delete-me.md');
      expect(await getMemoryCount()).toBe(0);
    });

    it('should not throw when deleting non-existent memory', async () => {
      setMemoryRoot(memoryDir);
      const { ensureTable, deleteMemory } = await import('../../vector-db.js');

      ensureTable();
      await expect(deleteMemory('ghost.md')).resolves.not.toThrow();
    });
  });

  describe('getAllTags', () => {
    it('should return unique sorted tags', async () => {
      setMemoryRoot(memoryDir);
      const { ensureTable, upsertMemory, getAllTags } = await import('../../vector-db.js');
      const embeddings = await import('../../embeddings.js');

      const vec = deterministicEmbedding(400);
      (embeddings._setEmbedding as (t: string, v: number[]) => void)('s1', vec);
      (embeddings._setEmbedding as (t: string, v: number[]) => void)('s2', vec);
      (embeddings._setEmbedding as (t: string, v: number[]) => void)('s3', vec);

      ensureTable();
      await upsertMemory({
        path: 'a.md', title: 'A', summary: 's1',
        tags: ['react', 'hooks'], created: '', modified: '', content: '', raw: '',
      });
      await upsertMemory({
        path: 'b.md', title: 'B', summary: 's2',
        tags: ['react', 'typescript'], created: '', modified: '', content: '', raw: '',
      });
      await upsertMemory({
        path: 'c.md', title: 'C', summary: 's3',
        tags: ['frontend'], created: '', modified: '', content: '', raw: '',
      });

      const tags = await getAllTags();
      expect(tags).toEqual(['frontend', 'hooks', 'react', 'typescript']);
    });

    it('should return empty array when no memories', async () => {
      setMemoryRoot(memoryDir);
      const { ensureTable, getAllTags } = await import('../../vector-db.js');

      ensureTable();
      const tags = await getAllTags();
      expect(tags).toEqual([]);
    });
  });

  describe('getRecentMemories', () => {
    it('should return memories ordered by modified desc', async () => {
      setMemoryRoot(memoryDir);
      const { ensureTable, upsertMemory, getRecentMemories } = await import('../../vector-db.js');
      const embeddings = await import('../../embeddings.js');

      const vec = deterministicEmbedding(500);
      (embeddings._setEmbedding as (t: string, v: number[]) => void)('s-old', vec);
      (embeddings._setEmbedding as (t: string, v: number[]) => void)('s-new', vec);

      ensureTable();
      await upsertMemory({
        path: 'old.md', title: 'Old', summary: 's-old',
        tags: [], created: '2024-01-01T00:00:00.000Z', modified: '2024-01-01T00:00:00.000Z',
        content: '', raw: '',
      });
      await upsertMemory({
        path: 'new.md', title: 'New', summary: 's-new',
        tags: [], created: '2025-06-01T00:00:00.000Z', modified: '2025-06-01T00:00:00.000Z',
        content: '', raw: '',
      });

      const recent = await getRecentMemories(2);
      expect(recent).toHaveLength(2);
      expect(recent[0].path).toBe('new.md');
      expect(recent[0].score).toBe(1);
    });

    it('should respect limit', async () => {
      setMemoryRoot(memoryDir);
      const { ensureTable, upsertMemory, getRecentMemories } = await import('../../vector-db.js');
      const embeddings = await import('../../embeddings.js');

      const vec = deterministicEmbedding(500);
      ensureTable();
      for (let i = 0; i < 5; i++) {
        (embeddings._setEmbedding as (t: string, v: number[]) => void)(`s-${i}`, vec);
        await upsertMemory({
          path: `r${i}.md`, title: `R${i}`, summary: `s-${i}`,
          tags: [], created: `2025-01-0${i + 1}T00:00:00.000Z`, modified: `2025-01-0${i + 1}T00:00:00.000Z`,
          content: '', raw: '',
        });
      }

      const recent = await getRecentMemories(2);
      expect(recent).toHaveLength(2);
    });
  });

  describe('clearCollection', () => {
    it('should drop and recreate the table', async () => {
      setMemoryRoot(memoryDir);
      const { ensureTable, upsertMemory, clearCollection, getMemoryCount } = await import('../../vector-db.js');
      const embeddings = await import('../../embeddings.js');

      const vec = deterministicEmbedding(600);
      (embeddings._setEmbedding as (t: string, v: number[]) => void)('s-clear', vec);

      ensureTable();
      await upsertMemory({
        path: 'will-be-cleared.md', title: 'Gone', summary: 's-clear',
        tags: [], created: '', modified: '', content: '', raw: '',
      });
      expect(await getMemoryCount()).toBe(1);

      await clearCollection();
      expect(await getMemoryCount()).toBe(0);
    });
  });

  describe('rebuildIndex', () => {
    it('should index all .md files in the vault', async () => {
      setMemoryRoot(memoryDir);
      const { ensureTable, rebuildIndex, getMemoryCount } = await import('../../vector-db.js');
      const embeddings = await import('../../embeddings.js');

      const vault = getVaultRoot();
      const fileContent = [
        '---',
        'title: "Rebuild Test"',
        'created: "2025-01-01T00:00:00.000Z"',
        'modified: "2025-01-01T00:00:00.000Z"',
        'tags: [rebuild, test]',
        'summary: "rebuilt memory summary"',
        '---',
        '',
        '# Rebuild Test',
        'Content.',
      ].join('\n');

      fs.writeFileSync(path.join(vault, 'rebuild-a.md'), fileContent);
      fs.writeFileSync(path.join(vault, 'rebuild-b.md'), fileContent);

      const vec = deterministicEmbedding(700);
      (embeddings._setEmbedding as (t: string, v: number[]) => void)('rebuilt memory summary', vec);

      ensureTable();
      const result = await rebuildIndex();
      expect(result.indexed).toBe(2);
      expect(result.errors).toBe(0);
      expect(await getMemoryCount()).toBe(2);
    });

    it('should skip files without summary', async () => {
      setMemoryRoot(memoryDir);
      const { rebuildIndex, getMemoryCount } = await import('../../vector-db.js');

      const vault = getVaultRoot();
      const noSummaryContent = [
        '---',
        'title: "No Summary"',
        'created: "2025-01-01T00:00:00.000Z"',
        'modified: "2025-01-01T00:00:00.000Z"',
        'tags: [test]',
        '---',
        '',
        '# No Summary',
      ].join('\n');

      fs.writeFileSync(path.join(vault, 'no-summary.md'), noSummaryContent);

      const result = await rebuildIndex();
      expect(result.indexed).toBe(0);
      expect(await getMemoryCount()).toBe(0);
    });
  });

  describe('getMemoryCount', () => {
    it('should return 0 for empty database', async () => {
      setMemoryRoot(memoryDir);
      const { ensureTable, getMemoryCount } = await import('../../vector-db.js');

      ensureTable();
      expect(await getMemoryCount()).toBe(0);
    });
  });
});
