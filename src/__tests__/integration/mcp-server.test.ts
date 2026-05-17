import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createTempDir, cleanupTempDir, initTestConfig } from '../helpers/temp-dir.js';

let tmpDir: string;
let memoryDir: string;

let capturedToolHandler: ((req: unknown) => Promise<unknown>) | null = null;
let capturedListHandler: (() => Promise<unknown>) | null = null;

vi.mock('@modelcontextprotocol/sdk/server/index.js', () => ({
  Server: vi.fn(function(this: Record<string, unknown>) {
    this.setRequestHandler = vi.fn((_schema: unknown, handler: unknown) => {
      if (capturedListHandler === null) {
        capturedListHandler = handler as () => Promise<unknown>;
      } else {
        capturedToolHandler = handler as (req: unknown) => Promise<unknown>;
      }
    });
    this.connect = vi.fn().mockResolvedValue(undefined);
  }),
}));

vi.mock('@modelcontextprotocol/sdk/server/stdio.js', () => ({
  StdioServerTransport: vi.fn(),
}));

vi.mock('../../vector-db.js', () => ({
  searchMemories: vi.fn(),
  upsertMemory: vi.fn(),
  deleteMemory: vi.fn(),
}));

vi.mock('../../memory-file.js', () => ({
  readMemoryFile: vi.fn(),
  writeMemoryFile: vi.fn(),
  deleteMemoryFile: vi.fn(),
  getAbsolutePath: vi.fn((p: string) => p),
}));

vi.mock('../../git.js', () => ({
  commit: vi.fn(),
}));

vi.mock('../../config.js', async () => {
  const actual = await vi.importActual<typeof import('../../config.js')>('../../config.js');
  return {
    ...actual,
    loadConfig: vi.fn(() => ({
      version: 1,
      git: { remote: '', branch: 'main' },
      embedding: { provider: 'ollama', model: 'nomic-embed-text', baseUrl: 'http://localhost:11434', dimensions: 768 },
      logging: { enabled: false, level: 'error' },
    })),
  };
});

vi.mock('../../logger.js', () => ({
  configureLogger: vi.fn(),
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  closeLogger: vi.fn(),
}));

vi.stubGlobal('process', { ...process, exit: vi.fn() as unknown as typeof process.exit });

let mcpServerImported = false;

async function ensureMCPImported() {
  if (mcpServerImported) return;
  mcpServerImported = true;
  try {
    await import('../../mcp-server.js');
  } catch {
    // main() may fail on connect, but handlers are already set up
  }
}

beforeEach(async () => {
  tmpDir = createTempDir();
  memoryDir = initTestConfig(tmpDir);

  vi.clearAllMocks();

  vi.stubGlobal('process', { ...process, exit: vi.fn() as unknown as typeof process.exit });

  const { setMemoryRoot } = await import('../../config.js');
  setMemoryRoot(memoryDir);

  await ensureMCPImported();
});

afterEach(() => {
  cleanupTempDir(tmpDir);
});

async function callTool(name: string, args: Record<string, unknown> = {}) {
  if (!capturedToolHandler) {
    throw new Error('Tool handler not captured — did mcp-server import?');
  }
  return capturedToolHandler({
    params: { name, arguments: args },
  });
}

describe('mcp-server tools', () => {
  describe('memory_search', () => {
    it('should return search results as JSON', async () => {
      const { searchMemories } = await import('../../vector-db.js');
      const mockSearch = vi.mocked(searchMemories);
      mockSearch.mockResolvedValue([
        { path: 'test/react.md', title: 'React', summary: 'React hooks summary', tags: ['react'], score: 0.85 },
      ]);

      const response = await callTool('memory_search', { query: 'react hooks', limit: 5 });

      expect(mockSearch).toHaveBeenCalledWith('react hooks', { limit: 5 });
      expect(response).toHaveProperty('content');
      const content = (response as { content: { type: string; text: string }[] }).content;
      const parsed = JSON.parse(content[0].text);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].path).toBe('test/react.md');
      expect(parsed[0].score).toBe(0.85);
    });

    it('should use default limit of 5', async () => {
      const { searchMemories } = await import('../../vector-db.js');
      const mockSearch = vi.mocked(searchMemories);
      mockSearch.mockResolvedValue([]);

      await callTool('memory_search', { query: 'test' });

      expect(mockSearch).toHaveBeenCalledWith('test', { limit: 5 });
    });

    it('should handle search errors gracefully', async () => {
      const { searchMemories } = await import('../../vector-db.js');
      vi.mocked(searchMemories).mockRejectedValue(new Error('DB error'));

      const response = await callTool('memory_search', { query: 'test' });

      expect(response).toHaveProperty('isError', true);
      expect((response as { content: { text: string }[] }).content[0].text).toContain('Error: DB error');
    });
  });

  describe('memory_write', () => {
    it('should write a memory and return result', async () => {
      const { writeMemoryFile } = await import('../../memory-file.js');
      const { upsertMemory } = await import('../../vector-db.js');
      const { commit } = await import('../../git.js');

      vi.mocked(writeMemoryFile).mockReturnValue({
        path: 'tech/test.md',
        title: 'Test Memory',
        summary: 'A test summary.',
        tags: ['test'],
        created: '2025-01-01T00:00:00.000Z',
        modified: '2025-01-01T00:00:00.000Z',
        content: 'Content.',
        raw: '---\ntitle: Test Memory\n---\n\nContent.',
      });
      vi.mocked(upsertMemory).mockResolvedValue(undefined);
      vi.mocked(commit).mockResolvedValue('abc1234');

      const response = await callTool('memory_write', {
        content: 'Content.',
        path: 'tech/test.md',
        title: 'Test Memory',
        tags: ['test'],
        summary: 'A test summary.',
      });

      expect(vi.mocked(writeMemoryFile)).toHaveBeenCalledWith('tech/test.md', {
        title: 'Test Memory',
        summary: 'A test summary.',
        tags: ['test'],
        content: 'Content.',
      });
      expect(vi.mocked(upsertMemory)).toHaveBeenCalled();
      expect(vi.mocked(commit)).toHaveBeenCalled();

      const content = (response as { content: { type: string; text: string }[] }).content;
      const parsed = JSON.parse(content[0].text);
      expect(parsed.path).toBe('tech/test.md');
      expect(parsed.committed).toBe('abc1234');
    });

    it('should return error when required fields are missing', async () => {
      const response = await callTool('memory_write', {
        content: '',
        path: '',
        title: '',
        tags: [],
        summary: '',
      });

      expect(response).toHaveProperty('isError', true);
      expect((response as { content: { text: string }[] }).content[0].text).toContain('Error');
    });
  });

  describe('memory_delete', () => {
    it('should delete a memory and return result', async () => {
      const { readMemoryFile, deleteMemoryFile } = await import('../../memory-file.js');
      const { deleteMemory } = await import('../../vector-db.js');

      vi.mocked(readMemoryFile).mockReturnValue({
        path: 'old/test.md',
        title: 'Old Memory',
        summary: 'Old.',
        tags: ['old'],
        created: '',
        modified: '',
        content: '',
        raw: '',
      });
      vi.mocked(deleteMemoryFile).mockReturnValue(true);
      vi.mocked(deleteMemory).mockResolvedValue(undefined);

      const response = await callTool('memory_delete', { path: 'old/test.md' });

      expect(vi.mocked(deleteMemory)).toHaveBeenCalledWith('old/test.md');
      expect(vi.mocked(deleteMemoryFile)).toHaveBeenCalledWith('old/test.md');

      const content = (response as { content: { type: string; text: string }[] }).content;
      const parsed = JSON.parse(content[0].text);
      expect(parsed.deleted).toBe('old/test.md');
    });

    it('should return error when path is missing', async () => {
      const response = await callTool('memory_delete', {});
      expect(response).toHaveProperty('isError', true);
    });

    it('should return error when memory not found', async () => {
      const { readMemoryFile } = await import('../../memory-file.js');
      vi.mocked(readMemoryFile).mockReturnValue(null);

      const response = await callTool('memory_delete', { path: 'missing.md' });
      expect(response).toHaveProperty('isError', true);
      expect((response as { content: { text: string }[] }).content[0].text).toContain('not found');
    });
  });

  describe('memory_move', () => {
    it('should move a memory and update index', async () => {
      const { readMemoryFile, writeMemoryFile, deleteMemoryFile } = await import('../../memory-file.js');
      const { upsertMemory, deleteMemory } = await import('../../vector-db.js');

      vi.mocked(readMemoryFile)
        .mockReturnValueOnce({
          path: 'old/path.md',
          title: 'Old Path',
          summary: 'Old.',
          tags: ['old'],
          created: '',
          modified: '',
          content: 'Content.',
          raw: 'raw',
        })
        .mockReturnValueOnce(null);

      vi.mocked(writeMemoryFile).mockReturnValue({
        path: 'new/path.md',
        title: 'Old Path',
        summary: 'Old.',
        tags: ['old'],
        created: '',
        modified: '',
        content: 'Content.',
        raw: 'raw',
      });
      vi.mocked(deleteMemoryFile).mockReturnValue(true);
      vi.mocked(upsertMemory).mockResolvedValue(undefined);
      vi.mocked(deleteMemory).mockResolvedValue(undefined);

      const response = await callTool('memory_move', {
        old_path: 'old/path.md',
        new_path: 'new/path.md',
      });

      expect(vi.mocked(deleteMemory)).toHaveBeenCalledWith('old/path.md');
      expect(vi.mocked(deleteMemoryFile)).toHaveBeenCalledWith('old/path.md');
      expect(vi.mocked(writeMemoryFile)).toHaveBeenCalledWith('new/path.md', expect.any(Object));
      expect(vi.mocked(upsertMemory)).toHaveBeenCalled();

      const content = (response as { content: { type: string; text: string }[] }).content;
      const parsed = JSON.parse(content[0].text);
      expect(parsed.moved_from).toBe('old/path.md');
      expect(parsed.moved_to).toBe('new/path.md');
    });

    it('should return error when required fields missing', async () => {
      const response = await callTool('memory_move', {});
      expect(response).toHaveProperty('isError', true);
    });

    it('should return error when source not found', async () => {
      const { readMemoryFile } = await import('../../memory-file.js');
      vi.mocked(readMemoryFile).mockReturnValue(null);

      const response = await callTool('memory_move', {
        old_path: 'missing.md',
        new_path: 'new.md',
      });
      expect(response).toHaveProperty('isError', true);
    });

    it('should return error when target already exists', async () => {
      const { readMemoryFile } = await import('../../memory-file.js');
      vi.mocked(readMemoryFile)
        .mockReturnValueOnce({ path: 'old.md', title: 'Old', summary: '', tags: [], created: '', modified: '', content: '', raw: '' })
        .mockReturnValueOnce({ path: 'new.md', title: 'New', summary: '', tags: [], created: '', modified: '', content: '', raw: '' });

      const response = await callTool('memory_move', {
        old_path: 'old.md',
        new_path: 'new.md',
      });
      expect(response).toHaveProperty('isError', true);
      expect((response as { content: { text: string }[] }).content[0].text).toContain('already exists');
    });
  });

  describe('unknown tool', () => {
    it('should return error for unknown tool name', async () => {
      const response = await callTool('memory_unknown', {});
      expect(response).toHaveProperty('isError', true);
      expect((response as { content: { text: string }[] }).content[0].text).toContain('Unknown tool');
    });
  });
});
