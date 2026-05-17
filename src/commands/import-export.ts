import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import chalk from 'chalk';
import archiver from 'archiver';
import extractZip from 'extract-zip';
import inquirer from 'inquirer';
import { getMemoryRoot, getAllMemoryFiles } from '../config.js';
import { indexCommand } from './index.js';

interface ExportOptions {
  output?: string;
}

interface ImportOptions {
  overwrite?: boolean;
}

export async function exportCommand(options: ExportOptions = {}): Promise<void> {
  const root = getMemoryRoot();
  const files = getAllMemoryFiles();

  if (files.length === 0) {
    console.log(chalk.yellow('No memories to export.'));
    return;
  }

  const timestamp = new Date()
    .toISOString()
    .replace(/[:.]/g, '-')
    .substring(0, 19);
  const outputPath =
    options.output || path.join(os.homedir(), `memories-${timestamp}.zip`);

  console.log(chalk.cyan(`\nExporting ${files.length} memories...`));

  await new Promise<void>((resolve, reject) => {
    const output = fs.createWriteStream(outputPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', resolve);
    archive.on('error', reject);

    archive.pipe(output);

    for (const file of files) {
      const fullPath = path.join(root, file);
      archive.file(fullPath, { name: file });
    }

    const configPath = path.join(root, 'config.json');
    if (fs.existsSync(configPath)) {
      archive.file(configPath, { name: 'config.json' });
    }

    archive.finalize();
  });

  const stats = fs.statSync(outputPath);
  const sizeMb = (stats.size / (1024 * 1024)).toFixed(2);
  console.log(
    chalk.green(`✓ Exported ${files.length} memories to ${outputPath} (${sizeMb} MB)`),
  );
}

export async function importCommand(
  zipPath: string,
  options: ImportOptions = {},
): Promise<void> {
  if (!zipPath) {
    console.log(
      chalk.red('Error: No zip file specified. Usage: memory import <file.zip>'),
    );
    return;
  }

  if (!fs.existsSync(zipPath)) {
    console.log(chalk.red(`Error: File not found: ${zipPath}`));
    return;
  }

  const root = getMemoryRoot();
  if (!fs.existsSync(root)) {
    fs.mkdirSync(root, { recursive: true });
  }

  console.log(chalk.cyan(`\nImporting memories from ${zipPath}...`));

  const tempDir = path.join(root, '_import_temp');
  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }

  await extractZip(zipPath, { dir: tempDir });

  const tempFiles: string[] = [];
  walkDir(tempDir, '', tempFiles);

  let imported = 0;
  let skipped = 0;

  for (const file of tempFiles) {
    const srcPath = path.join(tempDir, file);
    const destPath = path.join(root, file);

    if (file === 'config.json') {
      if (!fs.existsSync(destPath)) {
        const destDir = path.dirname(destPath);
        if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
        fs.copyFileSync(srcPath, destPath);
      }
      continue;
    }

    if (fs.existsSync(destPath) && !options.overwrite) {
      skipped++;
      continue;
    }

    const destDir = path.dirname(destPath);
    if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
    fs.copyFileSync(srcPath, destPath);
    imported++;
  }

  fs.rmSync(tempDir, { recursive: true, force: true });

  console.log(
    chalk.green(
      `✓ Imported ${imported} memories${skipped > 0 ? `, ${skipped} skipped (already exist)` : ''}`,
    ),
  );

  const { shouldIndex } = await inquirer.prompt<{ shouldIndex: boolean }>([
    {
      type: 'confirm',
      name: 'shouldIndex',
      message: 'Index imported memories for search?',
      default: true,
    },
  ]);

  if (shouldIndex) {
    await indexCommand();
  }
}

function walkDir(dir: string, base: string, result: string[]): void {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const relPath = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      walkDir(path.join(dir, entry.name), relPath, result);
    } else {
      result.push(relPath);
    }
  }
}
