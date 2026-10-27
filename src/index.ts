export { autoCommit } from "./engine.js";
export { default, GitAutocommitPlugin } from "./adapters/opencode-plugin.js";
export { CONFIG_FILE, DEFAULT_POLICY, configurationHome, loadPolicy, validateConfiguration } from "./config.js";
export { messageFromChanges, parseChanges } from "./message.js";
export type { Change } from "./message.js";
export type { Agent, Outcome, Policy, PolicyInput, Configuration, CommitRequest, CommitResult } from "./types.js";
