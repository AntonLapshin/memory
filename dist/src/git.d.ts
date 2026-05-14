import type { GitStatus, PullResult } from './types.js';
export declare function initGitRepo(): Promise<boolean>;
export declare function setRemote(remoteUrl: string): Promise<void>;
export declare function cloneOrPull(remoteUrl: string): Promise<void>;
export declare function commit(message: string): Promise<string | null>;
export declare function pull(): Promise<PullResult>;
export declare function push(): Promise<string>;
export declare function getStatus(): Promise<GitStatus>;
export declare function getCommitCount(): Promise<number>;
//# sourceMappingURL=git.d.ts.map