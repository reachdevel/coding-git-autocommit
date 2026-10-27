import type { CommitRequest, CommitResult } from "../types.js";
export interface OpenCodeEvent {
    id?: string;
    type: string;
    data?: unknown;
    location?: {
        directory: string;
    };
}
export interface OpenCodeContext {
    location: {
        directory: string;
    };
    event: {
        subscribe(options: {
            signal: AbortSignal;
        }): AsyncIterable<OpenCodeEvent>;
    };
    session: {
        get(options: {
            sessionID: string;
        }): Promise<{
            parentID?: string;
        } | null | undefined>;
    };
}
export interface OpenCodeSetupOptions {
    /** Injection points keep the host lifecycle testable without starting OpenCode. */
    commit?: (request: CommitRequest) => Promise<CommitResult>;
    report?: (result: CommitResult) => void;
    configHome?: string;
}
export declare function createOpenCodeSetup(options?: OpenCodeSetupOptions): (ctx: OpenCodeContext) => () => Promise<void>;
