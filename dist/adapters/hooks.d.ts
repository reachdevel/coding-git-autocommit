import type { Agent, CommitResult } from "../types.js";
type HookAgent = Extract<Agent, "claude" | "codex">;
export declare function parseHookInput(input: string): Record<string, unknown>;
export declare function runHook(agent: HookAgent, input: string, configHome?: string): Promise<CommitResult>;
export declare function reportResult(agent: Agent, result: CommitResult): void;
export {};
