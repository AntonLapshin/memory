interface ExportOptions {
    output?: string;
}
interface ImportOptions {
    overwrite?: boolean;
}
export declare function exportCommand(options?: ExportOptions): Promise<void>;
export declare function importCommand(zipPath: string, options?: ImportOptions): Promise<void>;
export {};
//# sourceMappingURL=import-export.d.ts.map