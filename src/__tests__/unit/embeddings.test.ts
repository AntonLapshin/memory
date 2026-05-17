import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createTempDir, cleanupTempDir, initTestConfig } from '../helpers/temp-dir.js';

let tmpDir: string;
let memoryDir: string;

beforeEach(() => {
  tmpDir = createTempDir();
  memoryDir = initTestConfig(tmpDir);
  vi.restoreAllMocks();
});

afterEach(() => {
  cleanupTempDir(tmpDir);
});

describe('embeddings', () => {
  describe('generateEmbedding', () => {
    it('should return 768-dimension embedding on success', async () => {
      const { setMemoryRoot } = await import('../../config.js');

      const mockEmbedding = Array.from({ length: 768 }, (_, i) => (i + 1) / 768);
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ embeddings: [mockEmbedding] }),
      }));

      const { generateEmbedding } = await import('../../embeddings.js');
      const result = await generateEmbedding('test query');
      expect(result).toHaveLength(768);
      expect(result[0]).toBeCloseTo(1 / 768);
    });

    it('should handle alternative embedding field name', async () => {
      const { setMemoryRoot } = await import('../../config.js');

      const mockEmbedding = Array.from({ length: 768 }, () => 0.1);
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ embedding: mockEmbedding }),
      }));

      const { generateEmbedding } = await import('../../embeddings.js');
      const result = await generateEmbedding('test');
      expect(result).toHaveLength(768);
    });

    it('should throw on non-ok response', async () => {
      const { setMemoryRoot } = await import('../../config.js');

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => 'Internal Server Error',
      }));

      const { generateEmbedding } = await import('../../embeddings.js');
      await expect(generateEmbedding('test')).rejects.toThrow('Embedding request failed (500)');
    });

    it('should call Ollama with correct model and input', async () => {
      const { setMemoryRoot } = await import('../../config.js');

      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ embeddings: [new Array(768).fill(0)] }),
      });
      vi.stubGlobal('fetch', fetchMock);

      const { generateEmbedding } = await import('../../embeddings.js');
      await generateEmbedding('hello world');

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const callUrl = fetchMock.mock.calls[0][0] as string;
      expect(callUrl).toContain('/api/embed');

      const callOptions = fetchMock.mock.calls[0][1] as { body: string };
      const body = JSON.parse(callOptions.body);
      expect(body.model).toBe('nomic-embed-text');
      expect(body.input).toBe('hello world');
    });
  });

  describe('checkOllamaHealth', () => {
    it('should report running when Ollama responds', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        text: async () => 'Ollama is running',
      }));

      const { checkOllamaHealth } = await import('../../embeddings.js');
      const result = await checkOllamaHealth('http://localhost:99999', 1000);
      expect(result.running).toBe(true);
    });

    it('should report not running on connection refused', async () => {
      const error = new Error('fetch failed');
      (error as NodeJS.ErrnoException).code = 'ECONNREFUSED';
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(error));

      const { checkOllamaHealth } = await import('../../embeddings.js');
      const result = await checkOllamaHealth('http://localhost:99999', 1000);
      expect(result.running).toBe(false);
      expect(result.error).toContain('Connection refused');
    });

    it('should handle timeout', async () => {
      vi.stubGlobal('fetch', vi.fn().mockImplementation(() => {
        return new Promise((_resolve, reject) => {
          const err = new Error('The operation was aborted');
          err.name = 'AbortError';
          setTimeout(() => reject(err), 2000);
        });
      }));

      const { checkOllamaHealth } = await import('../../embeddings.js');
      const result = await checkOllamaHealth('http://localhost:99999', 100);
      expect(result.running).toBe(false);
    });
  });

  describe('generateEmbeddingsBatch', () => {
    it('should call generateEmbedding for each text', async () => {
      const { setMemoryRoot } = await import('../../config.js');

      const mockEmbedding = new Array(768).fill(0);
      let callCount = 0;
      vi.stubGlobal('fetch', vi.fn().mockImplementation(() => {
        callCount++;
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ embeddings: [mockEmbedding] }),
        });
      }));

      const { generateEmbeddingsBatch } = await import('../../embeddings.js');
      const results = await generateEmbeddingsBatch(['a', 'b', 'c']);

      expect(results).toHaveLength(3);
      expect(callCount).toBe(3);
    });

    it('should report progress', async () => {
      const { setMemoryRoot } = await import('../../config.js');

      const mockEmbedding = new Array(768).fill(0);
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ embeddings: [mockEmbedding] }),
      }));

      const onProgress = vi.fn();
      const { generateEmbeddingsBatch } = await import('../../embeddings.js');
      await generateEmbeddingsBatch(['a', 'b'], onProgress);

      expect(onProgress).toHaveBeenCalledTimes(2);
      expect(onProgress).toHaveBeenCalledWith(1, 2);
      expect(onProgress).toHaveBeenCalledWith(2, 2);
    });
  });
});
