import chalk from 'chalk';
import { pull } from '../git.js';
import { isLocalMode } from '../config.js';
import { indexCommand } from './index.js';

export async function pullCommand(): Promise<void> {
  if (isLocalMode()) {
    console.log(chalk.yellow('Local mode: no remote to pull from. Changes are managed by your project repo.'));
    return;
  }

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
