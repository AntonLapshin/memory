interface IngestOptions {
    title?: string;
    path?: string;
    tags?: string;
    dryRun?: boolean;
    noCrossRef?: boolean;
    noGit?: boolean;
}
export declare function ingestCommand(rawText: string, options?: IngestOptions): Promise<void>;
export {};
//# sourceMappingURL=ingest.d.ts.map