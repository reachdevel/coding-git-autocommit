export declare function acquireLock(gitDirectory: string, timeoutMs: number): Promise<(() => Promise<void>) | undefined>;
