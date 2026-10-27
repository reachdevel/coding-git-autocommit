import type { Agent } from "./types.js";
export interface InstallOptions {
    agent: Agent;
    scope: "user" | "project";
    cwd?: string;
    home?: string;
    dryRun?: boolean;
    replaceLegacy?: boolean;
}
export interface InstallPlan {
    agent: Agent;
    target: string;
    runtime: string;
    events: string[];
    changed: boolean;
    dryRun: boolean;
    notes: string[];
}
export declare function shellQuote(value: string): string;
/** Copies all relative imports, so npx cache eviction cannot break installed hooks. */
export declare function install(options: InstallOptions): Promise<InstallPlan>;
