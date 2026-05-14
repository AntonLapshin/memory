import type { SummarizeResult, CrossLinkDecision } from './types.js';
interface ChatOptions {
    temperature?: number;
    json?: boolean;
}
export declare function chat(messages: Array<{
    role: string;
    content: string;
}>, options?: ChatOptions): Promise<string>;
export declare function summarizeForMemory(rawText: string, folderTree: string): Promise<SummarizeResult>;
export declare function shouldCrossLink(newMemorySummary: string, candidateSummary: string, candidatePath: string): Promise<CrossLinkDecision>;
export declare function generateCommitMessage(title: string, action: 'add' | 'update'): Promise<string>;
export {};
//# sourceMappingURL=llm.d.ts.map