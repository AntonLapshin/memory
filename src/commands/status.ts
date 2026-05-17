import chalk from 'chalk';
import { getStatus, getCommitCount } from '../git.js';
import { getAllMemoryFiles, isLocalMode, loadConfig } from '../config.js';
import { getAllTags, getMemoryCount } from '../vector-db.js';
import { checkOllamaHealth } from '../embeddings.js';

export async function statusCommand(): Promise<void> {
  console.log(chalk.bold.cyan('\n🧠 Memory Status\n'));

  try {
    const config = loadConfig();
    const status = await getStatus();
    const totalFiles = getAllMemoryFiles().length;
    const commitCount = await getCommitCount();
    const tags = await getAllTags();
    const indexedCount = await getMemoryCount();

    const ollamaHealth = await checkOllamaHealth(config.embedding.baseUrl);
    if (ollamaHealth.running) {
      console.log(chalk.white('Ollama:   '), chalk.green('connected'), chalk.dim(`(${config.embedding.baseUrl})`));
    } else {
      console.log(chalk.white('Ollama:   '), chalk.red.bold('NOT CONNECTED'), chalk.dim(`(${config.embedding.baseUrl})`));
      console.log(chalk.red(`          ${ollamaHealth.error || 'Unable to reach Ollama'}`));
      console.log(chalk.yellow('          Embeddings and vector search will fail until Ollama is running.'));
    }
    console.log();

    if (isLocalMode()) {
      console.log(chalk.white('Mode:     '), chalk.dim('local (project-scoped)'));
      console.log(chalk.white('Memories: '), chalk.bold(String(totalFiles)));
      console.log(chalk.white('Indexed:  '), chalk.bold(String(indexedCount)));
      console.log(
        chalk.white('Tags:     '),
        chalk.dim(
          tags.slice(0, 10).join(', ') +
            (tags.length > 10 ? ` +${tags.length - 10} more` : ''),
        ),
      );
      console.log(chalk.dim('\n  Git is managed by the project repository.'));
      console.log();
      return;
    }

    console.log(chalk.white('Repository:'), chalk.dim(status.remote || '(local only)'));
    console.log(chalk.white('Branch:    '), chalk.dim(status.branch));
    console.log(chalk.white('Commits:   '), chalk.dim(String(commitCount)));
    console.log();

    console.log(chalk.white('Memories:  '), chalk.bold(String(totalFiles)));
    console.log(chalk.white('Indexed:   '), chalk.bold(String(indexedCount)));
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
