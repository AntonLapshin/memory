import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { Config } from './types.js';

const MEMORY_DIR = '.memory';
const CONFIG_FILE = 'config.json';
const DB_FILE = 'memory.db';

let _memoryRoot: string | null = null;

export function setMemoryRoot(root: string): void {
  _memoryRoot = root;
}

export function getMemoryRoot(): string {
  if (_memoryRoot) return _memoryRoot;

  const localRoot = path.join(process.cwd(), MEMORY_DIR);
  const localConfig = path.join(localRoot, CONFIG_FILE);
  if (fs.existsSync(localConfig)) {
    _memoryRoot = localRoot;
    return _memoryRoot;
  }

  _memoryRoot = path.join(os.homedir(), MEMORY_DIR);
  return _memoryRoot;
}

export function isLocalMode(): boolean {
  return !getMemoryRoot().startsWith(os.homedir());
}

export function getVaultRoot(): string {
  return path.join(getMemoryRoot(), 'vault');
}

export function getConfigPath(): string {
  return path.join(getMemoryRoot(), CONFIG_FILE);
}

export function getDbPath(): string {
  return path.join(getMemoryRoot(), DB_FILE);
}

export function getDefaultConfig(): Config {
  return {
    version: 1,
    git: {
      remote: '',
      branch: 'main',
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
