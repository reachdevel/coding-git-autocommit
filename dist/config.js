import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
export const CONFIG_FILE = ".coding-git-autocommit.json";
export const DEFAULT_POLICY = Object.freeze({
    enabled: true,
    staging: "all",
    skipHooks: true,
    autoInit: false,
    rootOnly: true,
    events: Object.freeze({ success: true, failure: true, interrupted: true }),
    lockTimeoutMs: 5_000,
    gitTimeoutMs: 15_000,
});
export function configurationHome() {
    return join(process.env.XDG_CONFIG_HOME || join(homedir(), ".config"), "coding-git-autocommit");
}
function object(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function validatePolicy(value, label, allowConfiguration) {
    if (!object(value))
        throw new Error(`${label} must be an object`);
    const booleans = ["enabled", "skipHooks", "autoInit", "rootOnly"];
    const known = [...booleans, "staging", "events", "lockTimeoutMs", "gitTimeoutMs"];
    if (allowConfiguration)
        known.push("$schema", "agents");
    for (const [key, item] of Object.entries(value)) {
        if (!known.includes(key))
            throw new Error(`${label}: unknown option ${key}`);
        if (booleans.includes(key) && typeof item !== "boolean")
            throw new Error(`${label}.${key} must be boolean`);
        if (key === "staging" && item !== "all" && item !== "staged")
            throw new Error(`${label}.staging must be all or staged`);
        if ((key === "lockTimeoutMs" || key === "gitTimeoutMs") &&
            (typeof item !== "number" || !Number.isInteger(item) || item < 1 || item > 120_000)) {
            throw new Error(`${label}.${key} must be an integer from 1 to 120000`);
        }
        if (key === "$schema" && typeof item !== "string")
            throw new Error(`${label}.$schema must be a string`);
        if (key === "events") {
            if (!object(item))
                throw new Error(`${label}.events must be an object`);
            for (const [event, enabled] of Object.entries(item)) {
                if (!["success", "failure", "interrupted"].includes(event) || typeof enabled !== "boolean") {
                    throw new Error(`${label}.events contains an invalid event policy`);
                }
            }
        }
        if (key === "agents") {
            if (!object(item))
                throw new Error(`${label}.agents must be an object`);
            for (const [agent, policy] of Object.entries(item)) {
                if (!["claude", "codex", "opencode"].includes(agent))
                    throw new Error(`${label}: unknown agent ${agent}`);
                validatePolicy(policy, `${label}.agents.${agent}`, false);
            }
        }
    }
}
export function validateConfiguration(value, label = "configuration") {
    validatePolicy(value, label, true);
}
async function readConfiguration(file) {
    try {
        const value = JSON.parse(await readFile(file, "utf8"));
        validateConfiguration(value, file);
        return value;
    }
    catch (error) {
        if (error.code === "ENOENT")
            return {};
        throw error;
    }
}
function mergePolicy(base, patch) {
    const { events, ...rest } = patch;
    // Configuration metadata never leaks into a resolved policy.
    const options = Object.fromEntries(Object.entries(rest).filter(([key]) => key in DEFAULT_POLICY));
    return { ...base, ...options, events: { ...base.events, ...events } };
}
export async function loadPolicy(directory, agent, options = {}) {
    let policy = mergePolicy({ ...DEFAULT_POLICY, events: { ...DEFAULT_POLICY.events } }, options.defaults ?? {});
    for (const file of [join(options.configHome ?? configurationHome(), "config.json"), join(directory, CONFIG_FILE)]) {
        const config = await readConfiguration(file);
        policy = mergePolicy(policy, config);
        policy = mergePolicy(policy, config.agents?.[agent] ?? {});
    }
    if (options.overrides) {
        validatePolicy(options.overrides, "overrides", false);
        policy = mergePolicy(policy, options.overrides);
    }
    return policy;
}
