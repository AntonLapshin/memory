import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { Config } from './types.js';

const MEMORY_DIR = '.memory';
const CONFIG_FILE = 'config.json';

export function getMemoryRoot(): string {
  return path.join(os.homedir(), MEMORY_DIR);
}

export function getVaultRoot(): string {
  return path.join(getMemoryRoot(), 'vault');
}

export function getConfigPath(): string {
  return path.join(getMemoryRoot(), CONFIG_FILE);
}

export function getDefaultConfig(): Config {
  return {
    version: 1,
    git: {
      remote: '',
      branch: 'main',
    },
    qdrant: {
      url: 'http://localhost:6333',
      collection: 'memories',
    },
    llm: {
      provider: 'ollama',
      model: 'gemma4-e2b',
      baseUrl: 'http://localhost:11434',
    },
    embedding: {
      provider: 'ollama',
      model: 'nomic-embed-text',
      baseUrl: 'http://localhost:11434',
      dimensions: 768,
    },
    logging: {
      enabled: true,
      level: 'info',
    },
  };
}

export function loadConfig(): Config {
  const configPath = getConfigPath();
  if (!fs.existsSync(configPath)) {
    throw new Error(
      'No memory config found. Run "memory init" first.',
    );
  }
  try {
    const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as Partial<Config>;
    return { ...getDefaultConfig(), ...raw };
  } catch (e) {
    throw new Error(
      `Failed to parse config at ${configPath}: ${(e as Error).message}`,
    );
  }
}

export function saveConfig(config: Config): void {
  const memoryRoot = getMemoryRoot();
  if (!fs.existsSync(memoryRoot)) {
    fs.mkdirSync(memoryRoot, { recursive: true });
  }
  fs.writeFileSync(getConfigPath(), JSON.stringify(config, null, 2), 'utf-8');
}

export function isInitialized(): boolean {
  return fs.existsSync(getConfigPath());
}

export function ensureVault(): void {
  const vault = getVaultRoot();
  if (!fs.existsSync(vault)) {
    fs.mkdirSync(vault, { recursive: true });
  }
}

export function getAllMemoryFiles(): string[] {
  const root = getVaultRoot();
  if (!fs.existsSync(root)) return [];

  const files: string[] = [];

  function walk(dir: string): void {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.name.endsWith('.md')) {
        files.push(path.relative(root, fullPath));
      }
    }
  }

  walk(root);
  return files.sort();
}
