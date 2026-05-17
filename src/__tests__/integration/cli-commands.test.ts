import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createTempDir, cleanupTempDir, initTestConfig } from '../helpers/temp-dir.js';

let tmpDir: string;
let memoryDir: string;

vi.mock('../../vector-db.js', () => ({
  searchMemories: vi.fn(),
  upsertMemory: vi.fn(),
  rebuildIndex: vi.fn(),
}));

vi.mock('../../git.js', () => ({
  commit: vi.fn(),
}));

vi.mock('../../embeddings.js', () => ({
  generateEmbedding: vi.fn().mockResolvedValue(new Array(768).fill(0.1)),
}));

beforeEach(async () => {
  tmpDir = createTempDir();
  memoryDir = initTestConfig(tmpDir);
  vi.clearAllMocks();

  const { setMemoryRoot } = await import('../../config.js');
  setMemoryRoot(memoryDir);
});

afterEach(() => {
  cleanupTempDir(tmpDir);
});

describe('ingest command', () => {
  it('should save a memory and index it', async () => {
    const { upsertMemory } = await import('../../vector-db.js');
    const { commit } = await import('../../git.js');
    vi.mocked(upsertMemory).mockResolvedValue(undefined);
    vi.mocked(commit).mockResolvedValue(null);

    const { ingestCommand } = await import('../../commands/ingest.js');

    const logSpy = vi.spyOn(console, 'log');
    await ingestCommand('This is my memory content.', {
      path: 'tech/nodejs.md',
      title: 'Node.js Notes',
      summary: 'A summary about Node.js.',
      tags: 'nodejs, backend',
    });

    expect(vi.mocked(upsertMemory)).toHaveBeenCalled();
    expect(logSpy.mock.calls.some((call) => call[0].includes('Created'))).toBe(true);
    expect(logSpy.mock.calls.some((call) => call[0].includes('Indexed'))).toBe(true);
    logSpy.mockRestore();
  });

  it('should show error when required options are missing', async () => {
    const { upsertMemory } = await import('../../vector-db.js');
    const { ingestCommand } = await import('../../commands/ingest.js');

    const logSpy = vi.spyOn(console, 'log');
    await ingestCommand('content', {});

    expect(vi.mocked(upsertMemory)).not.toHaveBeenCalled();
    expect(logSpy.mock.calls.some((call) => call[0].includes('Error'))).toBe(true);
    logSpy.mockRestore();
  });

  it('should show error when content is empty', async () => {
    const { upsertMemory } = await import('../../vector-db.js');
    const { ingestCommand } = await import('../../commands/ingest.js');

    const logSpy = vi.spyOn(console, 'log');
    await ingestCommand('  ', {
      path: 'test.md',
      title: 'Test',
      summary: 'Summary.',
    });

    expect(vi.mocked(upsertMemory)).not.toHaveBeenCalled();
    expect(logSpy.mock.calls.some((call) => call[0].includes('Error'))).toBe(true);
    logSpy.mockRestore();
  });

  it('should not commit when --no-git is passed', async () => {
    const { upsertMemory } = await import('../../vector-db.js');
    const { commit } = await import('../../git.js');
    vi.mocked(upsertMemory).mockResolvedValue(undefined);

    const { ingestCommand } = await import('../../commands/ingest.js');
    await ingestCommand('content', {
      path: 'test.md',
      title: 'Test',
      summary: 'Summary.',
      git: false,
    });

    expect(vi.mocked(commit)).not.toHaveBeenCalled();
  });

  it('should support dry-run mode', async () => {
    const { upsertMemory } = await import('../../vector-db.js');
    const { ingestCommand } = await import('../../commands/ingest.js');

    const logSpy = vi.spyOn(console, 'log');
    await ingestCommand('content for dry run', {
      path: 'dry.md',
      title: 'Dry Run',
      summary: 'A dry run test.',
      dryRun: true,
    });

    expect(vi.mocked(upsertMemory)).not.toHaveBeenCalled();
    expect(logSpy.mock.calls.some((call) => call[0].includes('Dry run'))).toBe(true);
    logSpy.mockRestore();
  });
});

describe('retrieve command', () => {
  it('should search and display results in text mode', async () => {
    const { searchMemories } = await import('../../vector-db.js');
    vi.mocked(searchMemories).mockResolvedValue([
      { path: 'test/react.md', title: 'React Hooks', summary: 'React hooks explained.', tags: ['react'], score: 0.85 },
    ]);

    const { retrieveCommand } = await import('../../commands/retrieve.js');
    const logSpy = vi.spyOn(console, 'log');

    await retrieveCommand('react hooks', { limit: 5 });

    expect(vi.mocked(searchMemories)).toHaveBeenCalledWith('react hooks', { limit: 5 });
    expect(logSpy.mock.calls.some((call) => call[0].includes('React Hooks'))).toBe(true);
    logSpy.mockRestore();
  });

  it('should output JSON when --json is set', async () => {
    const { searchMemories } = await import('../../vector-db.js');
    vi.mocked(searchMemories).mockResolvedValue([
      { path: 'test/json.md', title: 'JSON Test', summary: 'Test.', tags: ['test'], score: 0.9 },
    ]);

    const { retrieveCommand } = await import('../../commands/retrieve.js');
    const logSpy = vi.spyOn(console, 'log');

    await retrieveCommand('json test', { limit: 5, json: true });

    const jsonCall = logSpy.mock.calls.find((call) => {
      try { JSON.parse(call[0]); return true; } catch { return false; }
    });
    expect(jsonCall).toBeDefined();
    const parsed = JSON.parse(jsonCall![0]);
    expect(parsed[0].score).toBe(0.9);
    logSpy.mockRestore();
  });

  it('should show no results message for empty results', async () => {
    const { searchMemories } = await import('../../vector-db.js');
    vi.mocked(searchMemories).mockResolvedValue([]);

    const { retrieveCommand } = await import('../../commands/retrieve.js');
    const logSpy = vi.spyOn(console, 'log');

    await retrieveCommand('nothing matches this', { limit: 5 });

    expect(logSpy.mock.calls.some((call) => call[0].includes('No matching'))).toBe(true);
    logSpy.mockRestore();
  });

  it('should show error for empty query', async () => {
    const { searchMemories } = await import('../../vector-db.js');
    const { retrieveCommand } = await import('../../commands/retrieve.js');
    const logSpy = vi.spyOn(console, 'log');

    await retrieveCommand('  ', { limit: 5 });

    expect(vi.mocked(searchMemories)).not.toHaveBeenCalled();
    expect(logSpy.mock.calls.some((call) => call[0].includes('Error'))).toBe(true);
    logSpy.mockRestore();
  });
});

describe('index command', () => {
  it('should rebuild the index when vault has files', async () => {
    const { rebuildIndex } = await import('../../vector-db.js');
    vi.mocked(rebuildIndex).mockResolvedValue({ indexed: 5, errors: 0 });

    const { getVaultRoot } = await import('../../config.js');
    const vault = getVaultRoot();
    const md = [
      '---',
      'title: "Test Memory"',
      'created: "2025-01-01T00:00:00.000Z"',
      'modified: "2025-01-01T00:00:00.000Z"',
      'tags: [test]',
      'summary: "A test memory for indexing"',
      '---',
      '',
      '# Test',
      'Content.',
    ].join('\n');
    fs.writeFileSync(path.join(vault, 'index-test.md'), md);

    const { indexCommand } = await import('../../commands/index.js');
    const logSpy = vi.spyOn(console, 'log');

    await indexCommand();

    expect(vi.mocked(rebuildIndex)).toHaveBeenCalled();
    expect(logSpy.mock.calls.some((call) => call[0].includes('5 memories indexed'))).toBe(true);
    logSpy.mockRestore();
  });

  it('should report errors during indexing', async () => {
    const { rebuildIndex } = await import('../../vector-db.js');
    vi.mocked(rebuildIndex).mockResolvedValue({ indexed: 3, errors: 2 });

    const { getVaultRoot } = await import('../../config.js');
    const vault = getVaultRoot();
    const md = [
      '---',
      'title: "Test Memory"',
      'created: "2025-01-01T00:00:00.000Z"',
      'modified: "2025-01-01T00:00:00.000Z"',
      'tags: [test]',
      'summary: "A test memory for indexing"',
      '---',
      '',
      '# Test',
      'Content.',
    ].join('\n');
    fs.writeFileSync(path.join(vault, 'index-test-2.md'), md);

    const { indexCommand } = await import('../../commands/index.js');
    const logSpy = vi.spyOn(console, 'log');

    await indexCommand();

    expect(logSpy.mock.calls.some((call) => call[0].includes('errors'))).toBe(true);
    logSpy.mockRestore();
  });
});
