import { createHash, randomUUID } from "node:crypto";
import { access, readFile, realpath, rename, writeFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { CONFIG_FILE, loadPolicy } from "./config.js";
import { git, optionalGit, outputLine, repositoryRoot } from "./git.js";
import { acquireLock } from "./lock.js";
import { messageFromChanges, parseChanges } from "./message.js";
import type { CommitRequest, CommitResult, Policy } from "./types.js";

function skipped(reason: string, root?: string): CommitResult { return { status: "skipped", reason, root }; }

async function exists(file: string): Promise<boolean> {
  try { await access(file); return true; }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

async function identity(root: string, timeout: number): Promise<string[]> {
  const args: string[] = [];
  for (const [key, author, committer, fallback] of [
    ["name", "GIT_AUTHOR_NAME", "GIT_COMMITTER_NAME", "coding-git-autocommit"],
    ["email", "GIT_AUTHOR_EMAIL", "GIT_COMMITTER_EMAIL", "coding-git-autocommit@localhost"],
  ] as const) {
    if (!(await optionalGit(root, ["config", "--get", `user.${key}`], timeout)) &&
      !(process.env[author]?.trim() && process.env[committer]?.trim())) args.push("-c", `user.${key}=${fallback}`);
  }
  return args;
}

async function processedEvents(file: string): Promise<string[]> {
  try {
    const value: unknown = JSON.parse(await readFile(file, "utf8"));
    if (!Array.isArray(value) || !value.every(item => typeof item === "string")) throw new Error("Invalid autocommit event state");
    return value;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

async function commitUnderLock(root: string, gitDirectory: string, policy: Policy, request: CommitRequest): Promise<CommitResult> {
  const runGit = (args: string[]) => git(root, args, policy.gitTimeoutMs);
  for (const marker of ["MERGE_HEAD", "CHERRY_PICK_HEAD", "REVERT_HEAD", "rebase-merge", "rebase-apply", "sequencer", "BISECT_LOG"]) {
    if (await exists(join(gitDirectory, marker))) return skipped(`Git operation in progress: ${marker}`, root);
  }
  if ((await runGit(["ls-files", "--unmerged", "-z"])).length) return skipped("Unresolved merge conflicts", root);
  const stateFile = join(gitDirectory, "coding-git-autocommit-events.json");
  // A session alone is not an execution identity: it can contain many turns.
  const eventKey = request.turnId && request.sessionId
    ? createHash("sha256").update(JSON.stringify([request.agent, request.sessionId, request.turnId])).digest("hex") : undefined;
  const events = eventKey ? await processedEvents(stateFile) : [];
  if (eventKey && events.includes(eventKey)) return skipped("Execution already processed", root);

  if (policy.staging === "all") await runGit(["add", "--all", "--", "."]);
  const changes = parseChanges(await runGit(["diff", "--cached", "--name-status", "-z", "--find-renames"]));
  const message = messageFromChanges(changes);
  if (!message) return skipped("No staged changes", root);
  const args = [...await identity(root, policy.gitTimeoutMs), "commit", "-m", message];
  if (policy.skipHooks) args.push("--no-verify");
  await runGit(args);
  const commit = (await runGit(["rev-parse", "HEAD"])).trim();
  if (eventKey) {
    const temporary = `${stateFile}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify([...events, eventKey].slice(-128)) + "\n", { mode: 0o600 });
    await rename(temporary, stateFile);
  }
  return { status: "committed", reason: "Created commit", root, commit, message };
}

/** Errors become results so a failed auto-commit never blocks the host agent. */
export async function autoCommit(request: CommitRequest): Promise<CommitResult> {
  let release: (() => Promise<void>) | undefined;
  let root: string | undefined;
  try {
    if (!isAbsolute(request.cwd)) return skipped("Working directory must be absolute");
    root = await repositoryRoot(request.cwd);
    const policy = await loadPolicy(root ?? request.cwd, request.agent, request);
    if (!policy.enabled) return skipped("Disabled by configuration", root);
    if (!policy.events[request.outcome]) return skipped(`Disabled event: ${request.outcome}`, root);
    if (policy.rootOnly && request.isSubagent) return skipped("Subagent execution", root);
    if (!root) {
      if (!policy.autoInit) return skipped("Not a Git working tree");
      await git(request.cwd, ["init"], policy.gitTimeoutMs);
      root = await repositoryRoot(request.cwd);
      if (!root) throw new Error("git init did not create a working tree");
    }
    root = await realpath(root);
    const gitDirectory = await realpath(outputLine(await git(root, ["rev-parse", "--absolute-git-dir"], policy.gitTimeoutMs)));
    release = await acquireLock(gitDirectory, policy.lockTimeoutMs);
    if (!release) return skipped("Another auto-commit owns the repository lock", root);
    return await commitUnderLock(root, gitDirectory, policy, request);
  } catch (error) {
    return { status: "error", reason: error instanceof Error ? error.message : String(error), root };
  } finally {
    if (release) await release().catch(() => {});
  }
}

export { CONFIG_FILE };
