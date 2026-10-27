export interface Change {
    status: string;
    file: string;
}
/** NUL-delimited Git output handles spaces, Unicode, tabs, and newlines without quoting. */
export declare function parseChanges(output: string): Change[];
export declare function messageFromChanges(changes: readonly Change[]): string | undefined;
