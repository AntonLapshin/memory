import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { setMemoryRoot, getVaultRoot } from '../../config.js';
import {
  normalizePath,
  slugifyFilename,
  titleToFilename,
  getAbsolutePath,
  writeMemoryFile,
  readMemoryFile,
  deleteMemoryFile,
} from '../../memory-file.js';
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

describe('memory-file', () => {
  describe('normalizePath', () => {
    it('should add .md extension if missing', () => {
      expect(normalizePath('foo/bar')).toBe('foo/bar.md');
    });

    it('should not double-add .md extension', () => {
      expect(normalizePath('foo/bar.md')).toBe('foo/bar.md');
    });

    it('should convert backslashes to forward slashes', () => {
      expect(normalizePath('foo\\bar')).toBe('foo/bar.md');
    });
  });

  describe('slugifyFilename', () => {
    it('should slugify a string', () => {
      const result = slugifyFilename('Hello World!');
      expect(result).toBe('hello-world');
    });

    it('should handle special characters', () => {
      const result = slugifyFilename('React Hooks: useState & useEffect');
      expect(result).toBe('react-hooks-usestate-and-useeffect');
    });
  });

  describe('titleToFilename', () => {
    it('should convert title to filename with .md extension', () => {
      expect(titleToFilename('My Title')).toBe('my-title.md');
    });
  });

  describe('getAbsolutePath', () => {
    it('should resolve relative path under vault root', () => {
      setMemoryRoot(memoryDir);
      const abs = getAbsolutePath('notes/foo.md');
      expect(abs).toBe(path.join(getVaultRoot(), 'notes/foo.md'));
    });
  });

  describe('writeMemoryFile / readMemoryFile', () => {
    it('should write and read a memory file with frontmatter', () => {
      setMemoryRoot(memoryDir);

      const written = writeMemoryFile('tech/react-hooks.md', {
        title: 'React Hooks',
        summary: 'A summary about React hooks.',
        tags: ['react', 'hooks', 'frontend'],
        content: '# React Hooks\n\nHooks are functions that let you use state.',
      });

      expect(written.path).toBe('tech/react-hooks.md');
      expect(written.title).toBe('React Hooks');
      expect(written.tags).toEqual(['react', 'hooks', 'frontend']);
      expect(written.content).toContain('Hooks are functions');

      const read = readMemoryFile('tech/react-hooks.md');
      expect(read).not.toBeNull();
      expect(read!.title).toBe('React Hooks');
      expect(read!.summary).toBe('A summary about React hooks.');
      expect(read!.tags).toEqual(['react', 'hooks', 'frontend']);
      expect(read!.content).toContain('# React Hooks');
      expect(read!.raw).toContain('---');
    });

    it('should create directories automatically', () => {
      setMemoryRoot(memoryDir);

      writeMemoryFile('deep/nested/path/note.md', {
        title: 'Deep Note',
        summary: 'Nested.',
        tags: [],
        content: 'Content.',
      });

      expect(fs.existsSync(path.join(getVaultRoot(), 'deep', 'nested', 'path', 'note.md'))).toBe(true);
    });

    it('should preserve created date on update', async () => {
      setMemoryRoot(memoryDir);

      const first = writeMemoryFile('update-test.md', {
        title: 'Original',
        summary: 'First write.',
        tags: [],
        content: 'Initial content.',
      });

      await new Promise((r) => setTimeout(r, 10));

      const second = writeMemoryFile('update-test.md', {
        title: 'Updated',
        summary: 'Second write.',
        tags: ['updated'],
        content: 'Updated content.',
      });

      expect(second.created).toBe(first.created);
      expect(second.title).toBe('Updated');
      expect(second.tags).toEqual(['updated']);
    });

    it('should return null when reading non-existent file', () => {
      setMemoryRoot(memoryDir);

      const result = readMemoryFile('does-not-exist.md');
      expect(result).toBeNull();
    });

    it('should escape double quotes in frontmatter values', () => {
      setMemoryRoot(memoryDir);

      writeMemoryFile('quotes.md', {
        title: 'He said "hello"',
        summary: 'A "quoted" summary.',
        tags: ['test'],
        content: 'Content with "quotes".',
      });

      const read = readMemoryFile('quotes.md');
      expect(read).not.toBeNull();
      expect(read!.title).toBe('He said "hello"');
      expect(read!.summary).toBe('A "quoted" summary.');
    });
  });

  describe('deleteMemoryFile', () => {
    it('should delete a memory file', () => {
      setMemoryRoot(memoryDir);

      writeMemoryFile('to-delete.md', {
        title: 'Delete Me',
        summary: 'Will be deleted.',
        tags: [],
        content: 'Content.',
      });

      const absPath = path.join(getVaultRoot(), 'to-delete.md');
      expect(fs.existsSync(absPath)).toBe(true);

      const result = deleteMemoryFile('to-delete.md');
      expect(result).toBe(true);
      expect(fs.existsSync(absPath)).toBe(false);
    });

    it('should return false for non-existent file', () => {
      setMemoryRoot(memoryDir);

      const result = deleteMemoryFile('never-existed.md');
      expect(result).toBe(false);
    });

    it('should clean up empty parent directories', () => {
      setMemoryRoot(memoryDir);

      writeMemoryFile('solo-dir/only-file.md', {
        title: 'Only File',
        summary: 'Lonely.',
        tags: [],
        content: 'Content.',
      });

      const dirPath = path.join(getVaultRoot(), 'solo-dir');
      expect(fs.existsSync(dirPath)).toBe(true);

      deleteMemoryFile('solo-dir/only-file.md');
      expect(fs.existsSync(dirPath)).toBe(false);
    });
  });
});
