import chalk from 'chalk';
import { searchMemories } from '../vector-db.js';
import { readMemoryFile } from '../memory-file.js';

interface RetrieveOptions {
  limit: number;
  full?: boolean;
  json?: boolean;
}

export async function retrieveCommand(
  query: string,
  options: RetrieveOptions,
): Promise<void> {
  if (!query || query.trim().length === 0) {
    console.log(chalk.red('Error: No query provided. Usage: memory retrieve "<query>"'));
    return;
  }

  const results = await searchMemories(query, {
    limit: options.limit || 5,
  });

  if (results.length === 0) {
    console.log(chalk.yellow('No matching memories found.'));
    return;
  }

  if (options.json) {
    const output = results.map((r) => {
      const memory = readMemoryFile(r.path);
      return {
        path: r.path,
        title: r.title,
        summary: memory?.summary || '',
        tags: r.tags,
        score: r.score,
      };
    });
    console.log(JSON.stringify(output, null, 2));
    return;
  }

  console.log(
    chalk.bold(`\nFound ${results.length} matching ${results.length === 1 ? 'memory' : 'memories'}:\n`),
  );

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const memory = readMemoryFile(r.path);
    const summary = memory?.summary || '';
    const scoreColor = r.score > 0.8 ? chalk.green : r.score > 0.6 ? chalk.yellow : chalk.dim;
    const numColor = r.score > 0.8 ? chalk.green : chalk.white;

    console.log(
      `${numColor(String(i + 1) + '.')} ${chalk.cyan(r.path)} ${scoreColor(`(${(r.score * 100).toFixed(0)}%)`)}`,
    );
    console.log(`   ${chalk.bold(r.title)}`);

    const summaryPreview =
      summary.length > 200
        ? summary.substring(0, 200) + '...'
        : summary;
    console.log(chalk.dim(`   ${summaryPreview}`));

    if (r.tags.length > 0) {
      console.log(chalk.dim(`   Tags: ${r.tags.join(', ')}`));
    }

    console.log();

    if (options.full && memory) {
      console.log(chalk.dim('---'));
      console.log(memory.content);
      console.log(chalk.dim('---\n'));
    }
  }
}
