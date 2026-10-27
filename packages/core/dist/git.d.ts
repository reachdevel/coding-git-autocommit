export declare function git(cwd: string, args: string[], timeout?: number): Promise<string>;
export declare function repositoryRoot(cwd: string): Promise<string | undefined>;
/** Remove Git's record separator, not whitespace belonging to a directory name. */
export declare function outputLine(output: string): string;
export declare function optionalGit(cwd: string, args: string[], timeout: number): Promise<string>;
