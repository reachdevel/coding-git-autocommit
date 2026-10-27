export { autoCommit } from "./engine.js";
export { default, GitAutocommitPlugin } from "./adapters/opencode-plugin.js";
export { CONFIG_FILE, DEFAULT_POLICY, configurationHome, loadPolicy, validateConfiguration } from "./config.js";
export { messageFromChanges, parseChanges } from "./message.js";
