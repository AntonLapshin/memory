import chalk from 'chalk';
import { getStatus, getCommitCount } from '../git.js';
import { getAllMemoryFiles } from '../config.js';
import { getAllTags } from '../qdrant.js';

export async function statusCommand(): Promise<void> {
  console.log(chalk.bold.cyan('\n🧠 Memory Status\n'));

  try {
    const status = await getStatus();
    const totalFiles = getAllMemoryFiles().length;
    const commitCount = await getCommitCount();
    const tags = await getAllTags();

    console.log(chalk.white('Repository:'), chalk.dim(status.remote || '(local only)'));
    console.log(chalk.white('Branch:    '), chalk.dim(status.branch));
    console.log(chalk.white('Commits:   '), chalk.dim(String(commitCount)));
    console.log();

    console.log(chalk.white('Memories:  '), chalk.bold(String(totalFiles)));
    console.log(
      chalk.white('Tags:      '),
      chalk.dim(
        tags.slice(0, 10).join(', ') +
          (tags.length > 10 ? ` +${tags.length - 10} more` : ''),
      ),
    );
    console.log();

    if (status.changes) {
      console.log(chalk.yellow('Changes:   Uncommitted changes present'));
      for (const file of status.files.slice(0, 10)) {
        console.log(chalk.dim(`           ${file}`));
      }
      if (status.files.length > 10) {
        console.log(chalk.dim(`           ... and ${status.files.length - 10} more`));
      }
    } else {
      console.log(chalk.green('Changes:   Working tree clean'));
    }

    if (status.unpushed > 0) {
      console.log(chalk.yellow(`Unpushed:  ${status.unpushed} commit(s) ahead of remote`));
    }

    console.log();
  } catch (e) {
    console.log(chalk.red(`Could not get status: ${(e as Error).message}`));
    console.log(chalk.dim('Is this a git repository? Run "memory init" first.'));
  }
}
