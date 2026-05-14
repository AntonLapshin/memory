import chalk from 'chalk';
import { getAllMemoryFiles, isLocalMode } from '../config.js';
import { summarizeForMemory, shouldCrossLink } from '../llm.js';
import { writeMemoryFile, addRelatedLink, readMemoryFile } from '../memory-file.js';
import { findDuplicates, searchMemories, upsertMemory } from '../qdrant.js';
import { commit } from '../git.js';

interface IngestOptions {
  title?: string;
  path?: string;
  tags?: string;
  dryRun?: boolean;
  crossRef?: boolean; // commander: --no-cross-ref makes this false
  git?: boolean;      // commander: --no-git makes this false
}

export async function ingestCommand(
  rawText: string,
  options: IngestOptions = {},
): Promise<void> {
  if (!rawText || rawText.trim().length === 0) {
    console.log(chalk.red('Error: No content provided. Usage: memory ingest "<text>"'));
    return;
  }

  console.log(chalk.dim('Analyzing memory...'));
  const existingFiles = getAllMemoryFiles();
  const folderTree = buildFolderTree(existingFiles);
  const summary = await summarizeForMemory(rawText, folderTree);

  if (options.title) summary.title = options.title;
  if (options.path) summary.suggested_path = options.path;
  if (options.tags) summary.tags = options.tags.split(',').map((t) => t.trim());

  console.log(chalk.cyan(`  Title: ${summary.title}`));
  console.log(chalk.cyan(`  Path: ${summary.suggested_path}`));
  console.log(chalk.cyan(`  Tags: ${summary.tags.join(', ')}`));
  console.log(chalk.cyan(`  Summary: ${summary.summary.substring(0, 100)}...`));

  if (options.dryRun) {
    console.log(chalk.yellow('\nDry run — no changes made.'));
    return;
  }

  const duplicates = await findDuplicates(summary.summary, 0.95);
  if (duplicates.length > 0) {
    console.log(chalk.yellow('\n⚠ Potential duplicate found:'));
    for (const dup of duplicates) {
      console.log(chalk.yellow(`  ${dup.path} (${(dup.score * 100).toFixed(0)}% match)`));
    }
    console.log(chalk.dim('  Ingesting anyway...\n'));
  }

  const memory = writeMemoryFile(summary.suggested_path, {
    title: summary.title,
    summary: summary.summary,
    tags: summary.tags,
    content: summary.content,
  });
  console.log(chalk.green(`✓ Created ${memory.path}`));

  if (options.crossRef !== false) {
    console.log(chalk.dim('Finding related memories...'));
    const relatedSearches = await searchMemories(summary.summary, { limit: 5 });

    const relatedMemories = relatedSearches.filter(
      (r) => r.path !== memory.path && r.score > 0.4,
    );

    if (relatedMemories.length > 0) {
      console.log(chalk.cyan(`  Found ${relatedMemories.length} potentially related memories:`));
      let linkedCount = 0;

      for (const related of relatedMemories) {
        const decision = await shouldCrossLink(
          summary.summary,
          related.summary,
          related.path,
        );

        if (decision.link) {
          addRelatedLink(memory.path, related.path, related.title);
          addRelatedLink(related.path, memory.path, memory.title);

          console.log(chalk.green(`  ✓ Linked: ${related.path} (${decision.reason})`));
          linkedCount++;
        } else {
          console.log(chalk.dim(`  - Skipped: ${related.path} (${decision.reason})`));
        }
      }

      if (linkedCount > 0) {
        for (const related of relatedMemories) {
          const updatedRelated = readMemoryFile(related.path);
          if (updatedRelated) {
            await upsertMemory(updatedRelated);
          }
        }
      }
    } else {
      console.log(chalk.dim('  No related memories found.'));
    }
  }

  const updatedMemory = readMemoryFile(memory.path) ?? memory;
  await upsertMemory(updatedMemory);
  console.log(chalk.green('✓ Indexed in Qdrant'));

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

function buildFolderTree(files: string[]): string {
  if (files.length === 0) return '(empty)';

  const tree = new Map<string, unknown>();

  for (const file of files) {
    const parts = file.replace(/\\/g, '/').split('/');
    let current = tree;
    for (let i = 0; i < Math.min(parts.length - 1, 3); i++) {
      if (!current.has(parts[i])) {
        current.set(parts[i], new Map<string, unknown>());
      }
      current = current.get(parts[i]) as Map<string, unknown>;
    }
  }

  function render(node: Map<string, unknown>, depth = 0): string {
    let result = '';
    for (const [key, children] of node) {
      result += '  '.repeat(depth) + '📁 ' + key + '\n';
      if (children instanceof Map && children.size > 0 && depth < 3) {
        result += render(children, depth + 1);
      }
    }
    return result;
  }

  return render(tree);
}
