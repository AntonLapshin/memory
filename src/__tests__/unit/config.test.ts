import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  setMemoryRoot,
  getMemoryRoot,
  isLocalMode,
  getDefaultConfig,
  loadConfig,
  saveConfig,
  isInitialized,
  ensureVault,
  getAllMemoryFiles,
  getVaultRoot,
  getDbPath,
  getConfigPath,
} from '../../config.js';
import { createTempDir, cleanupTempDir, initTestConfig } from '../helpers/temp-dir.js';

let tmpDir: string;
let memoryDir: string;

beforeEach(() => {
  tmpDir = createTempDir();
  memoryDir = initTestConfig(tmpDir);
});

afterEach(() => {
  cleanupTempDir(tmpDir);
});

describe('config', () => {
  describe('setMemoryRoot / getMemoryRoot', () => {
    it('should return the explicitly set memory root', () => {
      setMemoryRoot(memoryDir);
      expect(getMemoryRoot()).toBe(memoryDir);
    });

    it('isLocalMode returns true when root is not under home dir', () => {
      setMemoryRoot(memoryDir);
      expect(isLocalMode()).toBe(true);
    });
  });

  describe('getDefaultConfig', () => {
    it('should return config with version 1', () => {
      const cfg = getDefaultConfig();
      expect(cfg.version).toBe(1);
    });

    it('should default to ollama provider', () => {
      const cfg = getDefaultConfig();
      expect(cfg.embedding.provider).toBe('ollama');
    });

    it('should default to nomic-embed-text model', () => {
      const cfg = getDefaultConfig();
      expect(cfg.embedding.model).toBe('nomic-embed-text');
    });

    it('should default to 768 dimensions', () => {
      const cfg = getDefaultConfig();
      expect(cfg.embedding.dimensions).toBe(768);
    });

    it('should default to localhost:11434 base URL', () => {
      const cfg = getDefaultConfig();
      expect(cfg.embedding.baseUrl).toBe('http://localhost:11434');
    });

    it('should have logging enabled at info level', () => {
      const cfg = getDefaultConfig();
      expect(cfg.logging.enabled).toBe(true);
      expect(cfg.logging.level).toBe('info');
    });
  });

  describe('loadConfig', () => {
    it('should load config from the memory root', () => {
      setMemoryRoot(memoryDir);
      const cfg = loadConfig();
      expect(cfg.version).toBe(1);
      expect(cfg.embedding.model).toBe('nomic-embed-text');
    });

    it('should throw when no config file exists', () => {
      const emptyDir = createTempDir();
      const emptyMemDir = path.join(emptyDir, '.memory');
      fs.mkdirSync(emptyMemDir, { recursive: true });
      try {
        setMemoryRoot(emptyMemDir);
        expect(() => loadConfig()).toThrow('No memory config found');
      } finally {
        cleanupTempDir(emptyDir);
      }
    });
  });

  describe('saveConfig', () => {
    it('should write config to disk', () => {
      setMemoryRoot(memoryDir);
      const cfg = getDefaultConfig();
      cfg.embedding.model = 'test-model';
      saveConfig(cfg);

      const loaded = loadConfig();
      expect(loaded.embedding.model).toBe('test-model');
    });
  });

  describe('isInitialized', () => {
    it('should return true when config exists', () => {
      setMemoryRoot(memoryDir);
      expect(isInitialized()).toBe(true);
    });

    it('should return false when config does not exist', () => {
      const emptyDir = createTempDir();
      const emptyMemDir = path.join(emptyDir, '.memory');
      fs.mkdirSync(emptyMemDir, { recursive: true });
      try {
        setMemoryRoot(emptyMemDir);
        expect(isInitialized()).toBe(false);
      } finally {
        cleanupTempDir(emptyDir);
      }
    });
  });

  describe('ensureVault', () => {
    it('should create vault directory if missing', () => {
      const emptyDir = createTempDir();
      const emptyMemDir = path.join(emptyDir, '.memory');
      fs.mkdirSync(emptyMemDir, { recursive: true });
      try {
        setMemoryRoot(emptyMemDir);
        ensureVault();
        expect(fs.existsSync(getVaultRoot())).toBe(true);
      } finally {
        cleanupTempDir(emptyDir);
      }
    });
  });

  describe('getAllMemoryFiles', () => {
    it('should return empty array for empty vault', () => {
      setMemoryRoot(memoryDir);
      expect(getAllMemoryFiles()).toEqual([]);
    });

    it('should find .md files recursively', () => {
      setMemoryRoot(memoryDir);

      const vault = getVaultRoot();
      fs.mkdirSync(path.join(vault, 'personal'), { recursive: true });
      fs.writeFileSync(path.join(vault, 'test.md'), '# Test');
      fs.writeFileSync(path.join(vault, 'personal', 'notes.md'), '# Notes');
      fs.writeFileSync(path.join(vault, 'not-a-memory.txt'), 'text');

      const files = getAllMemoryFiles();
      expect(files).toHaveLength(2);
      expect(files).toContain('test.md');
      expect(files).toContain('personal/notes.md');
    });

    it('should skip dotfiles and dotdirs', () => {
      setMemoryRoot(memoryDir);

      const vault = getVaultRoot();
      fs.mkdirSync(path.join(vault, '.hidden'), { recursive: true });
      fs.writeFileSync(path.join(vault, '.hidden', 'secret.md'), '# Secret');
      fs.writeFileSync(path.join(vault, '.gitkeep.md'), '# gitkeep');
      fs.writeFileSync(path.join(vault, 'visible.md'), '# Visible');

      const files = getAllMemoryFiles();
      expect(files).not.toContain('.gitkeep.md');
    });
  });

  describe('path helpers', () => {
    it('getDbPath should return the db file path', () => {
      setMemoryRoot(memoryDir);
      expect(getDbPath()).toBe(path.join(memoryDir, 'memory.db'));
    });

    it('getConfigPath should return the config file path', () => {
      setMemoryRoot(memoryDir);
      expect(getConfigPath()).toBe(path.join(memoryDir, 'config.json'));
    });

    it('getVaultRoot should return vault directory path', () => {
      setMemoryRoot(memoryDir);
      expect(getVaultRoot()).toBe(path.join(memoryDir, 'vault'));
    });
  });
});
