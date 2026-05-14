import fs from 'node:fs';
import path from 'node:path';
import simpleGit from 'simple-git';
import { getMemoryRoot, loadConfig } from './config.js';
function getGit() {
    return simpleGit(getMemoryRoot());
}
export async function initGitRepo() {
    const root = getMemoryRoot();
    const gitPath = path.join(root, '.git');
    if (fs.existsSync(gitPath))
        return false;
    const git = simpleGit(root);
    await git.init();
    return true;
}
export async function setRemote(remoteUrl) {
    const git = getGit();
    try {
        const remotes = await git.getRemotes();
        const hasOrigin = remotes.some((r) => r.name === 'origin');
        if (hasOrigin) {
            await git.remote(['set-url', 'origin', remoteUrl]);
        }
        else {
            await git.addRemote('origin', remoteUrl);
        }
    }
    catch (e) {
        if (e.message.includes('not a git repository')) {
            await initGitRepo();
            await git.addRemote('origin', remoteUrl);
        }
        else {
            throw e;
        }
    }
}
export async function cloneOrPull(remoteUrl) {
    const root = getMemoryRoot();
    const gitPath = path.join(root, '.git');
    if (fs.existsSync(gitPath)) {
        const git = getGit();
        const config = loadConfig();
        try {
            await git.pull('origin', config.git.branch || 'main');
        }
        catch (e) {
            if (e.message.includes('no such remote')) {
                await git.addRemote('origin', remoteUrl);
                await git.pull('origin', config.git.branch || 'main');
            }
            else {
                throw e;
            }
        }
    }
    else {
        if (!fs.existsSync(root)) {
            fs.mkdirSync(root, { recursive: true });
        }
        const tempDir = path.join(root, '_temp_clone');
        const git = simpleGit();
        await git.clone(remoteUrl, tempDir);
        const entries = fs.readdirSync(tempDir);
        for (const entry of entries) {
            if (entry === '.git')
                continue;
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
export async function commit(message) {
    const git = getGit();
    const status = await git.status();
    if (status.isClean())
        return null;
    await git.add('*.md');
    await git.add('**/*.md');
    await git.add('config.json');
    const result = await git.commit(message);
    return result.commit || null;
}
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
export async function push() {
    const config = loadConfig();
    const git = getGit();
    const result = await git.push('origin', config.git.branch || 'main');
    return result.pushed?.[0]?.alreadyUpdated
        ? 'Already up to date'
        : 'Pushed successfully';
}
export async function getStatus() {
    const config = loadConfig();
    const git = getGit();
    const status = await git.status();
    const remotes = await git.getRemotes();
    const remote = remotes.find((r) => r.name === 'origin');
    return {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
export async function getCommitCount() {
    try {
        const git = getGit();
        const log = await git.log();
        return log.total || 0;
    }
    catch {
        return 0;
    }
}
//# sourceMappingURL=git.js.map