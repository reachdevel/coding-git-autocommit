import type { Agent, Configuration, Policy, PolicyInput } from "./types.js";
export declare const CONFIG_FILE = ".coding-git-autocommit.json";
export declare const DEFAULT_POLICY: Readonly<Policy>;
export declare function configurationHome(): string;
export declare function validateConfiguration(value: unknown, label?: string): asserts value is Configuration;
export declare function loadPolicy(directory: string, agent: Agent, options?: {
    defaults?: PolicyInput;
    overrides?: PolicyInput;
    configHome?: string;
}): Promise<Policy>;
