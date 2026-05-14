import chalk from 'chalk';
import { pull } from '../git.js';
import { indexCommand } from './index.js';

export async function pullCommand(): Promise<void> {
  console.log(chalk.cyan('\nPulling from remote...'));

  try {
    const result = await pull();
    console.log(chalk.green(`✓ Pulled${result.pulled > 0 ? ` ${result.pulled} commit(s)` : ''}`));

    if (result.pulled > 0) {
      console.log(chalk.cyan('\nRe-indexing changed memories...'));
      await indexCommand();
    }
  } catch (e) {
    console.log(chalk.red(`✗ Pull failed: ${(e as Error).message}`));
  }
}
