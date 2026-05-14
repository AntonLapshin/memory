import chalk from 'chalk';
import { loadConfig, saveConfig } from '../config.js';
import type { Config } from '../types.js';

interface ConfigOptions {
  set?: string;
}

export function configCommand(options: ConfigOptions = {}): void {
  if (options.set) {
    const [key, ...valueParts] = options.set.split('=');
    const value = valueParts.join('=');

    if (!key || !value) {
      console.log(chalk.red('Error: Use format "memory config --set key=value"'));
      console.log(chalk.dim('Example: memory config --set qdrant.url=http://localhost:6334'));
      return;
    }

    const config = loadConfig();
    const keys = key.trim().split('.');

    let current: Record<string, unknown> = config as unknown as Record<string, unknown>;
    for (let i = 0; i < keys.length - 1; i++) {
      if (!(keys[i] in current)) {
        console.log(chalk.red(`Error: Unknown config key "${key}"`));
        return;
      }
      current = current[keys[i]] as Record<string, unknown>;
    }

    const lastKey = keys[keys.length - 1];
    const oldValue = current[lastKey];

    if (typeof oldValue === 'number') {
      current[lastKey] = Number(value);
    } else if (typeof oldValue === 'boolean') {
      current[lastKey] = value === 'true';
    } else {
      current[lastKey] = value;
    }

    saveConfig(config);
    console.log(chalk.green(`✓ Updated ${key}: ${oldValue} → ${current[lastKey]}`));
    console.log(
      chalk.dim('  You may need to run "memory index" if you changed Qdrant or embedding settings.'),
    );
  } else {
    const config = loadConfig();
    console.log(chalk.bold.cyan('\n🧠 Memory Configuration\n'));
    console.log(chalk.white('Git:'));
    console.log(chalk.dim(`  remote:  ${config.git.remote || '(not set)'}`));
    console.log(chalk.dim(`  branch:  ${config.git.branch}`));
    console.log();
    console.log(chalk.white('Qdrant:'));
    console.log(chalk.dim(`  url:        ${config.qdrant.url}`));
    console.log(chalk.dim(`  collection: ${config.qdrant.collection}`));
    console.log();
    console.log(chalk.white('LLM:'));
    console.log(chalk.dim(`  provider: ${config.llm.provider}`));
    console.log(chalk.dim(`  model:    ${config.llm.model}`));
    console.log(chalk.dim(`  baseUrl:  ${config.llm.baseUrl}`));
    console.log();
    console.log(chalk.white('Embedding:'));
    console.log(chalk.dim(`  provider:   ${config.embedding.provider}`));
    console.log(chalk.dim(`  model:      ${config.embedding.model}`));
    console.log(chalk.dim(`  baseUrl:    ${config.embedding.baseUrl}`));
    console.log(chalk.dim(`  dimensions: ${config.embedding.dimensions}`));
    console.log();
  }
}
