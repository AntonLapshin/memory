import chalk from 'chalk';
import { isLocalMode } from '../config.js';
import { writeMemoryFile } from '../memory-file.js';
import { upsertMemory } from '../vector-db.js';
import { commit } from '../git.js';
import { generateEmbedding } from '../embeddings.js';

interface IngestOptions {
  title?: string;
  path?: string;
  tags?: string;
  summary?: string;
  dryRun?: boolean;
  git?: boolean;
}

export async function ingestCommand(
  rawText: string,
  options: IngestOptions = {},
): Promise<void> {
  if (!rawText || rawText.trim().length === 0) {
    console.log(chalk.red('Error: No content provided. Usage: memory ingest "<text>"'));
    return;
  }

  if (!options.path || !options.title || !options.summary) {
    console.log(chalk.red('Error: --path, --title, and --summary are required.'));
    console.log(chalk.dim('Usage: memory ingest "<text>" --path <path> --title <title> --summary <summary> [--tags <tags>]'));
    return;
  }

  const tags = options.tags ? options.tags.split(',').map((t) => t.trim()) : [];

  console.log(chalk.cyan(`  Title: ${options.title}`));
  console.log(chalk.cyan(`  Path: ${options.path}`));
  console.log(chalk.cyan(`  Tags: ${tags.join(', ') || '(none)'}`));
  console.log(chalk.cyan(`  Summary: ${options.summary.substring(0, 100)}...`));

  if (options.dryRun) {
    console.log(chalk.yellow('\nDry run — no changes made.'));
    return;
  }

  const memory = writeMemoryFile(options.path, {
    title: options.title,
    summary: options.summary,
    tags,
    content: rawText,
  });
  console.log(chalk.green(`✓ Created ${memory.path}`));

  await upsertMemory(memory);
  console.log(chalk.green('✓ Indexed'));

  if (options.git !== false && !isLocalMode()) {
    try {
      const hash = await commit(`memory: add "${memory.title}"`);
      if (hash) {
        console.log(chalk.green(`✓ Committed: ${hash.substring(0, 7)}`));
      } else {
        console.log(chalk.dim('  No changes to commit'));
      }
    } catch (e) {
      console.log(chalk.yellow(`⚠ Git commit failed: ${(e as Error).message}`));
    }
  }

  console.log(chalk.bold.green(`\n✨ Memory saved: ${memory.path}`));
}
