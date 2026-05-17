import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import slugify from 'slugify';
import { getVaultRoot } from './config.js';
import { logger } from './logger.js';
import type { MemoryFile, WriteMemoryData } from './types.js';

export function slugifyFilename(str: string): string {
  return slugify(str, { lower: true, strict: true });
}

export function titleToFilename(title: string): string {
  return slugifyFilename(title) + '.md';
}

export function normalizePath(p: string): string {
  let normalized = p.replace(/\\/g, '/');
  if (!normalized.endsWith('.md')) {
    normalized += '.md';
  }
  return normalized;
}

export function getAbsolutePath(relativePath: string): string {
  return path.join(getVaultRoot(), relativePath);
}

export function readMemoryFile(relativePath: string): MemoryFile | null {
  const fullPath = getAbsolutePath(relativePath);
  if (!fs.existsSync(fullPath)) {
    logger.debug('Memory file not found', { path: relativePath });
    return null;
  }

  const raw = fs.readFileSync(fullPath, 'utf-8');
  const parsed = matter(raw);

  return {
    path: normalizePath(relativePath),
    title: (parsed.data.title as string) || path.basename(relativePath, '.md'),
    summary: (parsed.data.summary as string) || '',
    tags: Array.isArray(parsed.data.tags) ? (parsed.data.tags as string[]) : [],
    created: (parsed.data.created as string) || new Date().toISOString(),
    modified: (parsed.data.modified as string) || new Date().toISOString(),
    content: parsed.content,
    raw,
  };
}

export function writeMemoryFile(
  relativePath: string,
  data: WriteMemoryData,
): MemoryFile {
  const now = new Date().toISOString();
  const normalized = normalizePath(relativePath);
  const fullPath = getAbsolutePath(normalized);

  const dir = path.dirname(fullPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    logger.debug('Created directory', { dir });
  }

  let created = now;
  if (fs.existsSync(fullPath)) {
    const existing = readMemoryFile(normalized);
    if (existing) {
      created = existing.created;
    }
  }

  const escapedTitle = data.title.replace(/"/g, '\\"');
  const escapedSummary = data.summary.replace(/"/g, '\\"');
  const tagsStr = data.tags.map((t) => `"${t.replace(/"/g, '\\"')}"`).join(', ');

  const frontmatter = [
    '---',
    `title: "${escapedTitle}"`,
    `created: "${created}"`,
    `modified: "${now}"`,
    `tags: [${tagsStr}]`,
    `summary: "${escapedSummary}"`,
    '---',
  ].join('\n');

  const fullContent = frontmatter + '\n\n' + data.content.trim() + '\n';
  fs.writeFileSync(fullPath, fullContent, 'utf-8');
  logger.info('Wrote memory file', { path: normalized, title: data.title });

  return {
    path: normalized,
    title: data.title,
    summary: data.summary,
    tags: data.tags,
    created,
    modified: now,
    content: data.content.trim(),
    raw: fullContent,
  };
}

export function deleteMemoryFile(relativePath: string): boolean {
  const normalized = normalizePath(relativePath);
  const fullPath = getAbsolutePath(normalized);

  if (!fs.existsSync(fullPath)) return false;

  fs.unlinkSync(fullPath);
  logger.info('Deleted memory file', { path: normalized });

  const dir = path.dirname(fullPath);
  try {
    const entries = fs.readdirSync(dir);
    if (entries.length === 0) {
      fs.rmdirSync(dir);
      logger.debug('Removed empty directory', { dir });
    }
  } catch {
    // directory might not be empty or already gone
  }

  return true;
}
