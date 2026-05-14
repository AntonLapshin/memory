/**
 * Git operations for the memory repository
 */
import fs from 'node:fs';
import path from 'node:path';
import simpleGit from 'simple-git';
import { getMemoryRoot, loadConfig } from './config.js';

/**
 * Get git instance for the memory root
 * @returns {import('simple-git').SimpleGit}
 */
function getGit() {
  return simpleGit(getMemoryRoot());
}

/**
 * Initialize git repo in memory root if not already initialized
 * @returns {Promise<boolean>} true if newly initialized
 */
export async function initGitRepo() {
  const root = getMemoryRoot();
  const gitPath = path.join(root, '.git');

  if (fs.existsSync(gitPath)) return false;

  const git = simpleGit(root);
  await git.init();
  return true;
}

/**
 * Set git remote
 * @param {string} remoteUrl
 * @returns {Promise<void>}
 */
export async function setRemote(remoteUrl) {
  const config = loadConfig();
  const git = getGit();

  try {
    // Check if remote origin exists
    const remotes = await git.getRemotes();
    const hasOrigin = remotes.some((r) => r.name === 'origin');

    if (hasOrigin) {
      await git.remote(['set-url', 'origin', remoteUrl]);
    } else {
      await git.addRemote('origin', remoteUrl);
    }
  } catch (e) {
    // If git not initialized, init first
    if (e.message.includes('not a git repository')) {
      await initGitRepo();
      await git.addRemote('origin', remoteUrl);
    } else {
      throw e;
    }
  }
}

/**
 * Clone/pull the remote repository
 * @param {string} remoteUrl
 * @returns {Promise<void>}
 */
export async function cloneOrPull(remoteUrl) {
  const root = getMemoryRoot();
  const gitPath = path.join(root, '.git');

  if (fs.existsSync(gitPath)) {
    // Pull existing repo
    const git = getGit();
    const config = loadConfig();
    try {
      await git.pull('origin', config.git.branch || 'main');
    } catch (e) {
      if (e.message.includes('no such remote')) {
        await git.addRemote('origin', remoteUrl);
        await git.pull('origin', config.git.branch || 'main');
      } else {
        throw e;
      }
    }
  } else {
    // Clone repo
    if (!fs.existsSync(root)) {
      fs.mkdirSync(root, { recursive: true });
    }

    // Clone into a temp dir first, then move contents
    const tempDir = path.join(root, '_temp_clone');
    const git = simpleGit();
    await git.clone(remoteUrl, tempDir);

    // Move contents to root
    const entries = fs.readdirSync(tempDir);
    for (const entry of entries) {
      if (entry === '.git') continue;
      const src = path.join(tempDir, entry);
      const dest = path.join(root, entry);
      fs.renameSync(src, dest);
    }

    // Move .git directory
    const gitSrc = path.join(tempDir, '.git');
    if (fs.existsSync(gitSrc)) {
      fs.renameSync(gitSrc, path.join(root, '.git'));
    }

    // Clean up temp
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }
}

/**
 * Stage and commit all changes
 * @param {string} message - Commit message
 * @returns {Promise<string | null>} Commit hash or null if nothing to commit
 */
export async function commit(message) {
  const git = getGit();
  const root = getMemoryRoot();

  // Check for changes
  const status = await git.status();
  if (status.isClean()) return null;

  // Stage all .md files and config
  await git.add('*.md');
  await git.add('**/*.md');
  await git.add('config.json');

  const result = await git.commit(message);
  return result.commit || null;
}

/**
 * Pull from remote
 * @returns {Promise<{pulled: number, summary: string}>}
 */
export async function pull() {
  const config = loadConfig();
  const git = getGit();

  const before = await git.revparse(['HEAD']);
  await git.pull('origin', config.git.branch || 'main');
  const after = await git.revparse(['HEAD']);

  const diff = await git.log({
    from: before,
    to: after,
  });

  return {
    pulled: diff.total || 0,
    summary: diff.all?.map((c) => c.message).join('\n') || 'No changes',
  };
}

/**
 * Push to remote
 * @returns {Promise<string>} Push output
 */
export async function push() {
  const config = loadConfig();
  const git = getGit();
  const result = await git.push('origin', config.git.branch || 'main');
  return result.pushed?.[0]?.alreadyUpdated
    ? 'Already up to date'
    : 'Pushed successfully';
}

/**
 * Get repository status
 * @returns {Promise<{remote: string, branch: string, unpushed: number, changes: boolean, files: string[]}>}
 */
export async function getStatus() {
  const config = loadConfig();
  const git = getGit();

  const status = await git.status();
  const remotes = await git.getRemotes();
  const remote = remotes.find((r) => r.name === 'origin');

  return {
    remote: remote?.refs?.fetch || config.git.remote,
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

/**
 * Get the local commit count
 * @returns {Promise<number>}
 */
export async function getCommitCount() {
  try {
    const git = getGit();
    const log = await git.log();
    return log.total || 0;
  } catch {
    return 0;
  }
}
