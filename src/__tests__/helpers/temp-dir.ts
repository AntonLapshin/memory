import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'memory-test-'));
}

export function cleanupTempDir(dir: string): void {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

export function initTestConfig(tmpRoot: string): string {
  const memoryDir = path.join(tmpRoot, '.memory');
  if (!fs.existsSync(memoryDir)) {
    fs.mkdirSync(memoryDir, { recursive: true });
  }

  const vaultDir = path.join(memoryDir, 'vault');
  if (!fs.existsSync(vaultDir)) {
    fs.mkdirSync(vaultDir, { recursive: true });
  }

  const logsDir = path.join(memoryDir, 'logs');
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }

  const config = {
    version: 1,
    git: { remote: '', branch: 'main' },
    embedding: {
      provider: 'ollama' as const,
      model: 'nomic-embed-text',
      baseUrl: 'http://localhost:11434',
      dimensions: 768,
    },
    logging: { enabled: false, level: 'error' as const },
  };

  fs.writeFileSync(
    path.join(memoryDir, 'config.json'),
    JSON.stringify(config, null, 2),
    'utf-8',
  );

  return memoryDir;
}
