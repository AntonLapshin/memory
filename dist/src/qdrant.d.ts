import type { MemoryFile, SearchResult, IndexResult } from './types.js';
export declare function ensureCollection(): Promise<void>;
export declare function isQdrantReachable(): Promise<boolean>;
export declare function upsertMemory(memory: MemoryFile): Promise<string>;
export declare function searchMemories(query: string, options?: {
    limit?: number;
    tags?: string[];
}): Promise<SearchResult[]>;
export declare function findDuplicates(summary: string, threshold?: number): Promise<SearchResult[]>;
export declare function deleteMemory(relativePath: string): Promise<void>;
export declare function getAllTags(): Promise<string[]>;
export declare function getRecentMemories(limit?: number): Promise<SearchResult[]>;
export declare function rebuildIndex(onProgress?: (done: number, total: number) => void): Promise<IndexResult>;
//# sourceMappingURL=qdrant.d.ts.map