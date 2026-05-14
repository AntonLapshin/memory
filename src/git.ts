import fs from 'node:fs';
import path from 'node:path';
import simpleGit, { type SimpleGit } from 'simple-git';
import { getMemoryRoot, getVaultRoot, loadConfig } from './config.js';
import { logger } from './logger.js';
import type { GitStatus, PullResult } from './types.js';

function getGit(): SimpleGit {
  return simpleGit(getMemoryRoot());
}

export async function initGitRepo(): Promise<boolean> {
  const root = getMemoryRoot();
  const gitPath = path.join(root, '.git');

  if (fs.existsSync(gitPath)) return false;

  const git = simpleGit(root);
  await git.init();
  logger.info('Initialized git repo', { root });
  return true;
}

export async function setRemote(remoteUrl: string): Promise<void> {
  const git = getGit();

  try {
    const remotes = await git.getRemotes();
    const hasOrigin = remotes.some((r) => r.name === 'origin');

    if (hasOrigin) {
      await git.remote(['set-url', 'origin', remoteUrl]);
    } else {
      await git.addRemote('origin', remoteUrl);
    }
    logger.info('Set git remote', { remoteUrl });
  } catch (e) {
    if ((e as Error).message.includes('not a git repository')) {
      await initGitRepo();
      await git.addRemote('origin', remoteUrl);
    } else {
      throw e;
    }
  }
}

export async function cloneOrPull(remoteUrl: string): Promise<void> {
  const root = getMemoryRoot();
  const gitPath = path.join(root, '.git');

  if (fs.existsSync(gitPath)) {
    const git = getGit();
    const config = loadConfig();
    try {
      await git.pull('origin', config.git.branch || 'main');
      logger.info('Pulled from remote', { remoteUrl });
    } catch (e) {
      if ((e as Error).message.includes('no such remote')) {
        await git.addRemote('origin', remoteUrl);
        await git.pull('origin', config.git.branch || 'main');
      } else {
        throw e;
      }
    }
  } else {
    if (!fs.existsSync(root)) {
      fs.mkdirSync(root, { recursive: true });
    }

    const tempDir = path.join(root, '_temp_clone');
    const git = simpleGit();
    await git.clone(remoteUrl, tempDir);
    logger.info('Cloned remote repo', { remoteUrl });

    const entries = fs.readdirSync(tempDir);
    for (const entry of entries) {
      if (entry === '.git') continue;
      const src = path.join(tempDir, entry);
      const dest = path.join(root, entry);
      fs.renameSync(src, dest);
    }

    const gitSrc = path.join(tempDir, '.git');
    if (fs.existsSync(gitSrc)) {
      fs.renameSync(gitSrc, path.join(root, '.git'));
    }

    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }
}

export async function commit(message: string): Promise<string | null> {
  const git = getGit();
  const vault = getVaultRoot();

  const status = await git.status();

  // Check if there are any changes in the vault or config
  const hasVaultChanges = [
    ...status.modified,
    ...status.created,
    ...status.not_added,
  ].some((f) => f.startsWith('vault/') || f.startsWith('vault\\') || f === 'config.json');

  if (!hasVaultChanges && Object.keys(status.staged).length === 0) {
    logger.debug('No changes to commit');
    return null;
  }

  // Stage vault files and config
  try {
    await git.add('vault/');
    await git.add('config.json');
    await git.add('.gitignore');
  } catch (e) {
    logger.warn('Git add warning', { error: (e as Error).message });
  }

  const result = await git.commit(message);
  logger.info('Committed', { message, hash: result.commit?.substring(0, 7) });
  return result.commit || null;
}

export async function pull(): Promise<PullResult> {
  const config = loadConfig();
  const git = getGit();

  const before = await git.revparse(['HEAD']);
  await git.pull('origin', config.git.branch || 'main');
  const after = await git.revparse(['HEAD']);

  const diff = await git.log({
    from: before,
    to: after,
  });

  logger.info('Pull complete', { commits: diff.total });
  return {
    pulled: diff.total || 0,
    summary: diff.all?.map((c) => c.message).join('\n') || 'No changes',
  };
}

export async function push(): Promise<string> {
  const config = loadConfig();
  const git = getGit();
  const result = await git.push('origin', config.git.branch || 'main');
  logger.info('Push complete');
  return result.pushed?.[0]?.alreadyUpdated
    ? 'Already up to date'
    : 'Pushed successfully';
}

export async function getStatus(): Promise<GitStatus> {
  const config = loadConfig();
  const git = getGit();

  const status = await git.status();
  const remotes = await git.getRemotes();
  const remote = remotes.find((r) => r.name === 'origin');

  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    remote: (remote as any)?.refs?.fetch || config.git.remote,
    branch: status.current || config.git.branch || 'main',
    unpushed: status.ahead || 0,
    changes: !status.isClean(),
    files: [
      ...status.modified,
      ...status.created,
      ...status.deleted,
      ...status.not_added.filter((f) => f.endsWith('.md')),
    ],
  };
}

export async function getCommitCount(): Promise<number> {
  try {
    const git = getGit();
    const log = await git.log();
    return log.total || 0;
  } catch {
    return 0;
  }
}
