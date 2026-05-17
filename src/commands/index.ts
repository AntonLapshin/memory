import chalk from 'chalk';
import { getAllMemoryFiles } from '../config.js';
import { rebuildIndex } from '../vector-db.js';

export async function indexCommand(): Promise<void> {
  const files = getAllMemoryFiles();

  if (files.length === 0) {
    console.log(chalk.yellow('No memory files found to index.'));
    return;
  }

  console.log(chalk.cyan(`\nIndexing ${files.length} memories...\n`));

  const startTime = Date.now();
  const { indexed, errors } = await rebuildIndex((done, total) => {
    const bar = '='.repeat(Math.floor((done / total) * 20)).padEnd(20);
    process.stdout.write(`\r  [${bar}] ${done}/${total}`);
  });

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('\n');

  if (errors > 0) {
    console.log(
      chalk.yellow(`Rebuilt with warnings: ${indexed} indexed, ${errors} errors (${elapsed}s)`),
    );
  } else {
    console.log(
      chalk.green(`✓ Index rebuilt: ${indexed} memories indexed (${elapsed}s)`),
    );
  }
}
