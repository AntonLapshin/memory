import type { MemoryFile, WriteMemoryData } from './types.js';
export declare function slugifyFilename(str: string): string;
export declare function titleToFilename(title: string): string;
export declare function normalizePath(p: string): string;
export declare function getAbsolutePath(relativePath: string): string;
export declare function readMemoryFile(relativePath: string): MemoryFile | null;
export declare function writeMemoryFile(relativePath: string, data: WriteMemoryData): MemoryFile;
export declare function addRelatedLink(relativePath: string, linkedPath: string, linkedTitle: string): void;
export declare function getWikiLinks(relativePath: string): string[];
//# sourceMappingURL=memory-file.d.ts.map