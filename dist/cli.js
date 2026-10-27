import { resolve } from "node:path";
import { autoCommit } from "./engine.js";
import { install } from "./install.js";
import { reportResult, runHook } from "./adapters/hooks.js";
import { VERSION } from "./version.js";
const USAGE = `Usage:
  coding-git-autocommit install <claude|codex|opencode> <--user|--project> [--dry-run] [--replace-legacy]
  coding-git-autocommit hook <claude|codex>  # host hook JSON on stdin
  coding-git-autocommit commit <claude|codex|opencode> [--cwd DIRECTORY] [--staged] [--respect-hooks]
  coding-git-autocommit --version

Installation configures only the selected agent. --dry-run never writes files.
Repository policy: .coding-git-autocommit.json; user policy: ~/.config/coding-git-autocommit/config.json.
Codex hooks require separate native trust review after installation.`;
function agent(value) {
    if (value === "claude" || value === "codex" || value === "opencode")
        return value;
    throw new Error("Choose claude, codex, or opencode");
}
export async function runCli(args) {
    const command = args[0];
    try {
        if (!command || args.includes("--help") || args.includes("-h")) {
            console.log(USAGE);
            return 0;
        }
        if (command === "--version" || command === "-v") {
            console.log(VERSION);
            return 0;
        }
        if (command === "hook") {
            const host = agent(args[1]);
            if (host === "opencode" || args.length !== 2)
                throw new Error("hook expects claude or codex");
            const chunks = [];
            let length = 0;
            for await (const chunk of process.stdin) {
                const buffer = Buffer.from(chunk);
                length += buffer.length;
                if (length > 1024 * 1024)
                    throw new Error("Hook input exceeds 1 MiB");
                chunks.push(buffer);
            }
            reportResult(host, await runHook(host, Buffer.concat(chunks).toString("utf8")));
            return 0;
        }
        if (command === "install") {
            const host = agent(args[1]);
            let scope;
            let dryRun = false;
            let replaceLegacy = false;
            for (const flag of args.slice(2)) {
                if (["--user", "-u", "--project", "-p"].includes(flag)) {
                    const next = flag === "--user" || flag === "-u" ? "user" : "project";
                    if (scope && scope !== next)
                        throw new Error("Choose exactly one installation scope");
                    scope = next;
                }
                else if (flag === "--dry-run" || flag === "-n")
                    dryRun = true;
                else if (flag === "--replace-legacy")
                    replaceLegacy = true;
                else
                    throw new Error(`Unknown option: ${flag}`);
            }
            if (!scope)
                throw new Error("Choose --user or --project");
            console.log(JSON.stringify(await install({ agent: host, scope, dryRun, replaceLegacy }), null, 2));
            return 0;
        }
        if (command === "commit") {
            const host = agent(args[1]);
            let cwd = process.cwd();
            const overrides = {};
            for (let i = 2; i < args.length; i++) {
                if (args[i] === "--cwd") {
                    const directory = args[++i];
                    if (!directory || directory.startsWith("--"))
                        throw new Error("--cwd requires a directory");
                    cwd = resolve(directory);
                }
                else if (args[i] === "--staged")
                    overrides.staging = "staged";
                else if (args[i] === "--respect-hooks")
                    overrides.skipHooks = false;
                else
                    throw new Error(`Unknown option: ${args[i]}`);
            }
            const result = await autoCommit({ cwd, agent: host, outcome: "success", overrides });
            console.log(JSON.stringify(result, null, 2));
            return result.status === "error" ? 1 : 0;
        }
        throw new Error(`Unknown command: ${command}`);
    }
    catch (error) {
        console.error(`[coding-git-autocommit] ${error instanceof Error ? error.message : String(error)}`);
        return command === "hook" ? 0 : 1;
    }
}
