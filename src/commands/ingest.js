/**
 * memory ingest — Save a new memory
 */
import chalk from 'chalk';
import { getAllMemoryFiles } from '../config.js';
import { summarizeForMemory, shouldCrossLink } from '../llm.js';
import { writeMemoryFile, addRelatedLink, readMemoryFile } from '../memory-file.js';
import { findDuplicates, searchMemories, upsertMemory } from '../qdrant.js';
import { commit } from '../git.js';

/**
 * @param {string} rawText
 * @param {Object} [options]
 * @param {string} [options.title]
 * @param {string} [options.path]
 * @param {string} [options.tags]
 * @param {boolean} [options.dryRun]
 * @param {boolean} [options.noCrossRef]
 * @param {boolean} [options.noGit]
 */
export async function ingestCommand(rawText, options = {}) {
  if (!rawText || rawText.trim().length === 0) {
    console.log(chalk.red('Error: No content provided. Usage: memory ingest "<text>"'));
    return;
  }

  // Step 1: Summarize
  console.log(chalk.dim('Analyzing memory...'));
  const existingFiles = getAllMemoryFiles();
  const folderTree = buildFolderTree(existingFiles);
  const summary = await summarizeForMemory(rawText, folderTree);

  // Apply overrides
  if (options.title) summary.title = options.title;
  if (options.path) summary.suggested_path = options.path;
  if (options.tags) summary.tags = options.tags.split(',').map(t => t.trim());

  console.log(chalk.cyan(`  Title: ${summary.title}`));
  console.log(chalk.cyan(`  Path: ${summary.suggested_path}`));
  console.log(chalk.cyan(`  Tags: ${summary.tags.join(', ')}`));
  console.log(chalk.cyan(`  Summary: ${summary.summary.substring(0, 100)}...`));

  if (options.dryRun) {
    console.log(chalk.yellow('\nDry run — no changes made.'));
    return;
  }

  // Step 2: Check for duplicates
  const duplicates = await findDuplicates(summary.summary, 0.95);
  if (duplicates.length > 0) {
    console.log(chalk.yellow('\n⚠ Potential duplicate found:'));
    for (const dup of duplicates) {
      console.log(chalk.yellow(`  ${dup.path} (${(dup.score * 100).toFixed(0)}% match)`));
    }
    // Continue anyway — the user might want to add it deliberately
    console.log(chalk.dim('  Ingesting anyway...\n'));
  }

  // Step 3: Write the file
  const memory = writeMemoryFile(summary.suggested_path, {
    title: summary.title,
    summary: summary.summary,
    tags: summary.tags,
    content: summary.content,
  });
  console.log(chalk.green(`✓ Created ${memory.path}`));

  // Step 4: Cross-referencing
  if (!options.noCrossRef) {
    console.log(chalk.dim('Finding related memories...'));
    const relatedSearches = await searchMemories(summary.summary, { limit: 5 });

    const relatedMemories = relatedSearches.filter(
      (r) => r.path !== memory.path && r.score > 0.4
    );

    if (relatedMemories.length > 0) {
      console.log(chalk.cyan(`  Found ${relatedMemories.length} potentially related memories:`));
      let linkedCount = 0;

      for (const related of relatedMemories) {
        // Use LLM to decide if we should link
        const decision = await shouldCrossLink(
          summary.summary,
          related.summary,
          related.path
        );

        if (decision.link) {
          // Add link to new memory pointing to related
          addRelatedLink(memory.path, related.path, related.title);

          // Add reciprocal link to related memory
          addRelatedLink(related.path, memory.path, memory.title);

          console.log(chalk.green(`  ✓ Linked: ${related.path} (${decision.reason})`));
          linkedCount++;
        } else {
          console.log(chalk.dim(`  - Skipped: ${related.path} (${decision.reason})`));
        }
      }

      if (linkedCount > 0) {
        // Re-read the updated related memory to update its Qdrant index
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

  // Step 5: Index in Qdrant
  await upsertMemory(memory);
  console.log(chalk.green('✓ Indexed in Qdrant'));

  // Step 6: Git commit
  if (!options.noGit) {
    try {
      const hash = await commit(`memory: add "${memory.title}"`);
      if (hash) {
        console.log(chalk.green(`✓ Committed: ${hash.substring(0, 7)}`));
      } else {
        console.log(chalk.dim('  No changes to commit'));
      }
    } catch (e) {
      console.log(chalk.yellow(`⚠ Git commit failed: ${e.message}`));
    }
  }

  console.log(chalk.bold.green(`\n✨ Memory saved: ${memory.path}`));
}

/**
 * Build a tree representation of existing folder structure
 * @param {string[]} files
 * @returns {string}
 */
function buildFolderTree(files) {
  if (files.length === 0) return '(empty)';

  /** @type {Map<string, any>} */
  const tree = new Map();

  for (const file of files) {
    const parts = file.split('/');
    let current = tree;
    for (let i = 0; i < Math.min(parts.length - 1, 3); i++) {
      if (!current.has(parts[i])) {
        current.set(parts[i], new Map());
      }
      current = current.get(parts[i]);
    }
  }

  /**
   * @param {Map<string, any>} node
   * @param {number} depth
   * @returns {string}
   */
  function render(node, depth = 0) {
    let result = '';
    for (const [key, children] of node) {
      result += '  '.repeat(depth) + '📁 ' + key + '\n';
      if (children.size > 0 && depth < 3) {
        result += render(children, depth + 1);
      }
    }
    return result;
  }

  return render(tree);
}
