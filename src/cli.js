/**
 * Memory CLI — Command router
 */
import { Command } from 'commander';
import chalk from 'chalk';
import { initCommand } from './commands/init.js';
import { ingestCommand } from './commands/ingest.js';
import { retrieveCommand } from './commands/retrieve.js';
import { indexCommand } from './commands/index.js';
import { pullCommand } from './commands/pull.js';
import { pushCommand } from './commands/push.js';
import { statusCommand } from './commands/status.js';
import { importCommand, exportCommand } from './commands/import-export.js';
import { configCommand } from './commands/config-cmd.js';

export function run() {
  const program = new Command();

  program
    .name('memory')
    .description('🧠 AI agent memory tool — store, search, and link memories with vector search')
    .version('1.0.0');

  // init
  program
    .command('init')
    .description('Initialize memory in wizard mode. Creates .memory/ and configures everything.')
    .action(async () => {
      try {
        await initCommand();
      } catch (e) {
        console.error(chalk.red(`Error: ${e.message}`));
        process.exit(1);
      }
    });

  // ingest
  program
    .command('ingest')
    .description('Save a new memory. The tool summarizes, finds the right folder, and cross-links.')
    .argument('<text>', 'Raw text to ingest as a memory')
    .option('--title <title>', 'Specify title (skip LLM guess)')
    .option('--path <path>', 'Specify exact file path (skip LLM guess)')
    .option('--tags <tags>', 'Comma-separated tags (skip LLM guess)')
    .option('--dry-run', 'Preview without saving')
    .option('--no-cross-ref', 'Skip cross-referencing other memories')
    .option('--no-git', 'Skip git commit')
    .action(async (text, options) => {
      try {
        await ingestCommand(text, options);
      } catch (e) {
        console.error(chalk.red(`Error: ${e.message}`));
        process.exit(1);
      }
    });

  // retrieve
  program
    .command('retrieve')
    .description('Search memories by semantic similarity.')
    .argument('<query>', 'Natural language search query')
    .option('--limit <number>', 'Max results (default: 5)', '5')
    .option('--tags <tags>', 'Filter by comma-separated tags')
    .option('--full', 'Show full content of all matches')
    .option('--json', 'Machine-readable JSON output')
    .action(async (query, options) => {
      try {
        await retrieveCommand(query, {
          ...options,
          limit: parseInt(options.limit, 10),
        });
      } catch (e) {
        console.error(chalk.red(`Error: ${e.message}`));
        process.exit(1);
      }
    });

  // index
  program
    .command('index')
    .description('Rebuild the Qdrant index from all .md memory files.')
    .action(async () => {
      try {
        await indexCommand();
      } catch (e) {
        console.error(chalk.red(`Error: ${e.message}`));
        process.exit(1);
      }
    });

  // pull
  program
    .command('pull')
    .description('Pull changes from remote repository and re-index.')
    .action(async () => {
      try {
        await pullCommand();
      } catch (e) {
        console.error(chalk.red(`Error: ${e.message}`));
        process.exit(1);
      }
    });

  // push
  program
    .command('push')
    .description('Push local commits to remote repository.')
    .action(async () => {
      try {
        await pushCommand();
      } catch (e) {
        console.error(chalk.red(`Error: ${e.message}`));
        process.exit(1);
      }
    });

  // status
  program
    .command('status')
    .description('Show repository and memory status.')
    .action(async () => {
      try {
        await statusCommand();
      } catch (e) {
        console.error(chalk.red(`Error: ${e.message}`));
        process.exit(1);
      }
    });

  // import
  program
    .command('import')
    .description('Import memories from a zip file.')
    .argument('<file>', 'Zip file to import')
    .option('--overwrite', 'Overwrite existing files')
    .action(async (file, options) => {
      try {
        await importCommand(file, options);
      } catch (e) {
        console.error(chalk.red(`Error: ${e.message}`));
        process.exit(1);
      }
    });

  // export
  program
    .command('export')
    .description('Export all memories to a zip file.')
    .option('--output <path>', 'Output file path')
    .action(async (options) => {
      try {
        await exportCommand(options);
      } catch (e) {
        console.error(chalk.red(`Error: ${e.message}`));
        process.exit(1);
      }
    });

  // config
  program
    .command('config')
    .description('View or update memory configuration.')
    .option('--set <key=value>', 'Set a config value (e.g. qdrant.url=http://localhost:6334)')
    .action(async (options) => {
      try {
        configCommand(options);
      } catch (e) {
        console.error(chalk.red(`Error: ${e.message}`));
        process.exit(1);
      }
    });

  program.parse();
}
