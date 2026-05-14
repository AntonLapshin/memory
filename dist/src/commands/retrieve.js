import chalk from 'chalk';
import { searchMemories } from '../qdrant.js';
import { readMemoryFile } from '../memory-file.js';
export async function retrieveCommand(query, options) {
    if (!query || query.trim().length === 0) {
        console.log(chalk.red('Error: No query provided. Usage: memory retrieve "<query>"'));
        return;
    }
    const tags = options.tags
        ? options.tags.split(',').map((t) => t.trim())
        : undefined;
    const results = await searchMemories(query, {
        limit: options.limit || 5,
        tags,
    });
    if (results.length === 0) {
        console.log(chalk.yellow('No matching memories found.'));
        return;
    }
    if (options.json) {
        const output = results.map((r) => ({
            path: r.path,
            title: r.title,
            summary: r.summary,
            tags: r.tags,
            score: r.score,
        }));
        console.log(JSON.stringify(output, null, 2));
        return;
    }
    console.log(chalk.bold(`\nFound ${results.length} matching ${results.length === 1 ? 'memory' : 'memories'}:\n`));
    for (let i = 0; i < results.length; i++) {
        const r = results[i];
        const scoreColor = r.score > 0.8 ? chalk.green : r.score > 0.6 ? chalk.yellow : chalk.dim;
        const numColor = r.score > 0.8 ? chalk.green : chalk.white;
        console.log(`${numColor(String(i + 1) + '.')} ${chalk.cyan(r.path)} ${scoreColor(`(${(r.score * 100).toFixed(0)}%)`)}`);
        console.log(`   ${chalk.bold(r.title)}`);
        const summaryPreview = r.summary.length > 200
            ? r.summary.substring(0, 200) + '...'
            : r.summary;
        console.log(chalk.dim(`   ${summaryPreview}`));
        if (r.tags.length > 0) {
            console.log(chalk.dim(`   Tags: ${r.tags.join(', ')}`));
        }
        console.log();
        if (options.full) {
            const memory = readMemoryFile(r.path);
            if (memory) {
                console.log(chalk.dim('---'));
                console.log(memory.content);
                console.log(chalk.dim('---\n'));
            }
        }
    }
}
//# sourceMappingURL=retrieve.js.map