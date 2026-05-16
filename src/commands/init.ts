import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import inquirer from 'inquirer';
import chalk from 'chalk';
import {
  getMemoryRoot,
  getVaultRoot,
  getConfigPath,
  getDefaultConfig,
  saveConfig,
  getAllMemoryFiles,
  ensureVault,
  setMemoryRoot,
} from '../config.js';
import { cloneOrPull, initGitRepo, setRemote } from '../git.js';
import { ensureCollection, rebuildIndex } from '../qdrant.js';
import { configureLogger } from '../logger.js';

function setupOpencodeConfig(): void {
  const cwd = process.cwd();
  const opencodePath = path.join(cwd, 'opencode.json');

  const mcpEntry = {
    memory: {
      type: 'local',
      command: ['mcp-memory'],
      enabled: true,
      timeout: 60000,
    },
  };

  let config: Record<string, unknown> = {};
  if (fs.existsSync(opencodePath)) {
    try {
      const existing = JSON.parse(fs.readFileSync(opencodePath, 'utf-8'));
      if (typeof existing === 'object' && existing !== null) {
        config = existing;
      }
    } catch {
      console.log(chalk.yellow('⚠ opencode.json exists but is invalid JSON, overwriting'));
    }
  }

  const existingMcp = (config.mcp as Record<string, unknown>) ?? {};
  config.mcp = { ...mcpEntry, ...existingMcp };
  config.$schema = config.$schema || 'https://opencode.ai/config.json';

  fs.writeFileSync(opencodePath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
  console.log(chalk.green('✓ opencode.json configured with MCP server'));
}

function setupClaudeConfig(): void {
  const cwd = process.cwd();
  const mcpPath = path.join(cwd, '.mcp.json');

  let config: Record<string, unknown> = {};

  if (fs.existsSync(mcpPath)) {
    try {
      const existing = JSON.parse(fs.readFileSync(mcpPath, 'utf-8'));
      if (typeof existing === 'object' && existing !== null) {
        config = existing;
      }
    } catch {
      console.log(chalk.yellow('⚠ .mcp.json exists but is invalid JSON, overwriting'));
    }
  }

  const existingServers = (config.mcpServers as Record<string, unknown>) ?? {};
  config.mcpServers = { memory: { command: 'mcp-memory' }, ...existingServers };

  fs.writeFileSync(mcpPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
  console.log(chalk.green('✓ .mcp.json configured with MCP server'));
}

function setupCommands(target: 'opencode' | 'claude'): void {
  const cwd = process.cwd();

  const commandsDir =
    target === 'claude'
      ? path.join(cwd, '.claude', 'commands')
      : path.join(cwd, '.opencode', 'command');

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const packageRoot = path.resolve(__dirname, '..', '..', '..');
  const sourceCommandsDir = path.join(packageRoot, 'commands');

  if (!fs.existsSync(sourceCommandsDir)) {
    console.log(chalk.yellow('⚠ Could not find commands directory in package'));
    return;
  }

  if (!fs.existsSync(commandsDir)) {
    fs.mkdirSync(commandsDir, { recursive: true });
  }

  const commandFiles = fs.readdirSync(sourceCommandsDir).filter((f) => f.endsWith('.md'));
  const label = target === 'claude' ? '.claude/commands/' : '.opencode/command/';

  for (const file of commandFiles) {
    const src = path.join(sourceCommandsDir, file);
    const dest = path.join(commandsDir, file);

    if (fs.existsSync(dest)) {
      console.log(chalk.dim(`  ${label}${file} already exists, skipping`));
      continue;
    }

    fs.copyFileSync(src, dest);
    console.log(chalk.green(`✓ ${label}${file} installed`));
  }
}

export async function initCommand(options: { global: boolean }): Promise<void> {
  const global = options.global;

  if (global) {
    console.log(chalk.bold.cyan('\n🧠 Memory — Global Setup Wizard\n'));
  } else {
    console.log(chalk.bold.cyan('\n🧠 Memory — Local Setup Wizard\n'));
    setMemoryRoot(path.join(process.cwd(), '.memory'));
    console.log(chalk.dim(`  Project-scoped: ${getMemoryRoot()}`));
  }

  const configPath = global
    ? path.join(os.homedir(), '.memory', 'config.json')
    : path.join(process.cwd(), '.memory', 'config.json');

  if (fs.existsSync(configPath)) {
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
    ...(global ? [{
      type: 'input' as const,
      name: 'remoteUrl' as const,
      message: 'GitHub repository URL (or leave empty for local-only):',
      default: '',
    }] : []),
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
      remote: (global ? answers.remoteUrl : '') || '',
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
    logging: {
      enabled: true,
      level: 'info' as const,
    },
  };

  // Set up directory structure
  const memoryRoot = getMemoryRoot();
  if (!fs.existsSync(memoryRoot)) {
    fs.mkdirSync(memoryRoot, { recursive: true });
  }

  // Create vault directory
  ensureVault();
  console.log(chalk.green('✓ Vault directory created'));

  // Create logs directory
  const logsDir = path.join(memoryRoot, 'logs');
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }
  console.log(chalk.green('✓ Logs directory created'));

  // Create .memory/.gitignore
  const gitignorePath = path.join(memoryRoot, '.gitignore');
  const gitignoreContent = '# Memory tool gitignore\nlogs/\n.obsidian/\n';
  fs.writeFileSync(gitignorePath, gitignoreContent, 'utf-8');
  console.log(chalk.green('✓ .gitignore created'));

  // Initialize logger
  configureLogger(config.logging);

  saveConfig(config);
  console.log(chalk.green('✓ Config saved'));

  if (global) {
    await initGitRepo();
    console.log(chalk.green('✓ Git repository initialized'));
  } else {
    console.log(chalk.dim('  Local mode — skipping git initialization (managed by project repo)'));
  }

  if (global && answers.remoteUrl) {
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

  const { clientTarget } = await inquirer.prompt<{ clientTarget: 'opencode' | 'claude' }>([
    {
      type: 'list',
      name: 'clientTarget',
      message: 'Which AI client are you configuring MCP for?',
      choices: [
        { name: 'OpenCode', value: 'opencode' },
        { name: 'Claude', value: 'claude' },
      ],
    },
  ]);

  if (clientTarget === 'claude') {
    setupClaudeConfig();
  } else {
    setupOpencodeConfig();
  }

  setupCommands(clientTarget);

  const root = getMemoryRoot();
  console.log(chalk.bold.green('\n✨ Memory is ready!'));
  console.log(chalk.dim(`   Mode: ${global ? 'global' : 'local (project-scoped)'}`));
  console.log(chalk.dim(`   Store: ${root}`));
  console.log(chalk.dim(`   Vault: ${getVaultRoot()}`));
  console.log(chalk.dim(`   Config: ${getConfigPath()}`));
  console.log(chalk.dim(`   Qdrant: ${config.qdrant.url}/${config.qdrant.collection}`));
  console.log(chalk.dim(`   LLM: ${config.llm.model} @ ${config.llm.baseUrl}`));
  console.log();
  console.log(chalk.cyan('  Next steps:'));
  console.log(chalk.dim('    memory ingest "something to remember"'));
  console.log(chalk.dim('    memory retrieve "search query"'));
  if (global) {
    console.log(chalk.dim('    memory status'));
  }
}
