import fs from 'node:fs';
import inquirer from 'inquirer';
import chalk from 'chalk';
import {
  getMemoryRoot,
  getConfigPath,
  getDefaultConfig,
  saveConfig,
  getAllMemoryFiles,
} from '../config.js';
import { cloneOrPull, initGitRepo, setRemote } from '../git.js';
import { ensureCollection, rebuildIndex } from '../qdrant.js';

export async function initCommand(): Promise<void> {
  console.log(chalk.bold.cyan('\n🧠 Memory — Setup Wizard\n'));

  if (fs.existsSync(getConfigPath())) {
    const { overwrite } = await inquirer.prompt<{ overwrite: boolean }>([
      {
        type: 'confirm',
        name: 'overwrite',
        message: 'Memory is already configured. Re-run setup?',
        default: false,
      },
    ]);
    if (!overwrite) {
      console.log(chalk.yellow('Setup cancelled.'));
      return;
    }
  }

  const defaults = getDefaultConfig();

  const answers = await inquirer.prompt<{
    remoteUrl: string;
    qdrantUrl: string;
    collectionName: string;
    llmBaseUrl: string;
    llmModel: string;
    embedBaseUrl: string;
    embedModel: string;
  }>([
    {
      type: 'input',
      name: 'remoteUrl',
      message: 'GitHub repository URL (or leave empty for local-only):',
      default: '',
    },
    {
      type: 'input',
      name: 'qdrantUrl',
      message: 'Qdrant server URL:',
      default: defaults.qdrant.url,
    },
    {
      type: 'input',
      name: 'collectionName',
      message: 'Qdrant collection name:',
      default: defaults.qdrant.collection,
    },
    {
      type: 'input',
      name: 'llmBaseUrl',
      message: 'Ollama (LLM) base URL:',
      default: defaults.llm.baseUrl,
    },
    {
      type: 'input',
      name: 'llmModel',
      message: 'LLM model:',
      default: defaults.llm.model,
    },
    {
      type: 'input',
      name: 'embedBaseUrl',
      message: 'Ollama (embeddings) base URL:',
      default: defaults.embedding.baseUrl,
    },
    {
      type: 'input',
      name: 'embedModel',
      message: 'Embedding model:',
      default: defaults.embedding.model,
    },
  ]);

  const config = {
    version: 1,
    git: {
      remote: answers.remoteUrl || '',
      branch: 'main' as const,
    },
    qdrant: {
      url: answers.qdrantUrl || defaults.qdrant.url,
      collection: answers.collectionName || defaults.qdrant.collection,
    },
    llm: {
      provider: 'ollama' as const,
      model: answers.llmModel || defaults.llm.model,
      baseUrl: answers.llmBaseUrl || defaults.llm.baseUrl,
    },
    embedding: {
      provider: 'ollama' as const,
      model: answers.embedModel || defaults.embedding.model,
      baseUrl: answers.embedBaseUrl || defaults.embedding.baseUrl,
      dimensions: 768,
    },
  };

  saveConfig(config);
  console.log(chalk.green('\n✓ Config saved'));

  await initGitRepo();
  console.log(chalk.green('✓ Git repository initialized'));

  if (answers.remoteUrl) {
    try {
      await setRemote(answers.remoteUrl);
      await cloneOrPull(answers.remoteUrl);
      console.log(chalk.green('✓ Remote repository cloned/synced'));
    } catch (e) {
      console.log(chalk.yellow(`⚠ Could not sync remote: ${(e as Error).message}`));
      console.log(chalk.yellow('  Continuing with local-only setup. Use "memory pull" later.'));
    }
  }

  try {
    await ensureCollection();
    console.log(chalk.green('✓ Qdrant collection created/verified'));
  } catch (e) {
    console.log(chalk.red(`✗ Failed to connect to Qdrant: ${(e as Error).message}`));
    console.log(chalk.yellow('  Make sure Qdrant is running: docker run -p 6333:6333 qdrant/qdrant'));
    return;
  }

  const existingFiles = getAllMemoryFiles();
  if (existingFiles.length > 0) {
    console.log(chalk.cyan(`\nFound ${existingFiles.length} existing memories. Indexing...`));
    const { indexed, errors } = await rebuildIndex((done, total) => {
      const bar = '='.repeat(Math.floor((done / total) * 20)).padEnd(20);
      process.stdout.write(`\r  [${bar}] ${done}/${total}`);
    });
    console.log(`\n${chalk.green(`✓ Indexed ${indexed} memories${errors > 0 ? `, ${errors} errors` : ''}`)}`);
  }

  const root = getMemoryRoot();
  console.log(chalk.bold.green('\n✨ Memory is ready!'));
  console.log(chalk.dim(`   Store: ${root}`));
  console.log(chalk.dim(`   Config: ${getConfigPath()}`));
  console.log(chalk.dim(`   Qdrant: ${config.qdrant.url}/${config.qdrant.collection}`));
  console.log(chalk.dim(`   LLM: ${config.llm.model} @ ${config.llm.baseUrl}`));
  console.log();
  console.log(chalk.cyan('  Next steps:'));
  console.log(chalk.dim('    memory ingest "something to remember"'));
  console.log(chalk.dim('    memory retrieve "search query"'));
  console.log(chalk.dim('    memory status'));
}
