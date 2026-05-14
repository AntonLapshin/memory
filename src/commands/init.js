/**
 * memory init — Initialize memory tool
 */
import fs from 'node:fs';
import inquirer from 'inquirer';
import chalk from 'chalk';
import { getMemoryRoot, getConfigPath, getDefaultConfig, saveConfig, getAllMemoryFiles } from '../config.js';
import { cloneOrPull, initGitRepo, setRemote } from '../git.js';
import { ensureCollection, isQdrantReachable, rebuildIndex } from '../qdrant.js';

/**
 * Run the init wizard
 */
export async function initCommand() {
  console.log(chalk.bold.cyan('\n🧠 Memory — Setup Wizard\n'));

  // Check if already initialized
  if (fs.existsSync(getConfigPath())) {
    const { overwrite } = await inquirer.prompt([
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

  const answers = await inquirer.prompt([
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

  // Build config
  const config = {
    version: 1,
    git: {
      remote: answers.remoteUrl || '',
      branch: 'main',
    },
    qdrant: {
      url: answers.qdrantUrl || defaults.qdrant.url,
      collection: answers.collectionName || defaults.qdrant.collection,
    },
    llm: {
      provider: 'ollama',
      model: answers.llmModel || defaults.llm.model,
      baseUrl: answers.llmBaseUrl || defaults.llm.baseUrl,
    },
    embedding: {
      provider: 'ollama',
      model: answers.embedModel || defaults.embedding.model,
      baseUrl: answers.embedBaseUrl || defaults.embedding.baseUrl,
      dimensions: 768,
    },
  };

  // Save config
  saveConfig(config);
  console.log(chalk.green('\n✓ Config saved'));

  // Init git
  await initGitRepo();
  console.log(chalk.green('✓ Git repository initialized'));

  // Clone/pull remote if provided
  if (answers.remoteUrl) {
    try {
      await setRemote(answers.remoteUrl);
      await cloneOrPull(answers.remoteUrl);
      console.log(chalk.green('✓ Remote repository cloned/synced'));
    } catch (e) {
      console.log(chalk.yellow(`⚠ Could not sync remote: ${e.message}`));
      console.log(chalk.yellow('  Continuing with local-only setup. Use "memory pull" later.'));
    }
  }

  // Connect to Qdrant and create collection
  try {
    await ensureCollection();
    console.log(chalk.green('✓ Qdrant collection created/verified'));
  } catch (e) {
    console.log(chalk.red(`✗ Failed to connect to Qdrant: ${e.message}`));
    console.log(chalk.yellow('  Make sure Qdrant is running: docker run -p 6333:6333 qdrant/qdrant'));
    return;
  }

  // Index existing memories
  const existingFiles = getAllMemoryFiles();
  if (existingFiles.length > 0) {
    console.log(chalk.cyan(`\nFound ${existingFiles.length} existing memories. Indexing...`));
    const { indexed, errors } = await rebuildIndex((done, total) => {
      process.stdout.write(`\r  [${'='.repeat(Math.floor(done / total * 20)).padEnd(20)}] ${done}/${total}`);
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
