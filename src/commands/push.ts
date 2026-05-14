import chalk from 'chalk';
import { push, getStatus } from '../git.js';

export async function pushCommand(): Promise<void> {
  console.log(chalk.cyan('\nPushing to remote...'));

  try {
    const status = await getStatus();
    if (status.unpushed === 0) {
      console.log(chalk.yellow('Nothing to push.'));
      return;
    }

    const result = await push();
    console.log(chalk.green(`✓ ${result}`));
  } catch (e) {
    console.log(chalk.red(`✗ Push failed: ${(e as Error).message}`));
  }
}
