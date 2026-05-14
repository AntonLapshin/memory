interface RetrieveOptions {
    limit: number;
    tags?: string;
    full?: boolean;
    json?: boolean;
}
export declare function retrieveCommand(query: string, options: RetrieveOptions): Promise<void>;
export {};
//# sourceMappingURL=retrieve.d.ts.map