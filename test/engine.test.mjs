import test from "node:test";
import assert from "node:assert/strict";
import { chmod, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { autoCommit, messageFromChanges, parseChanges } from "../packages/core/dist/index.js";
import { fixture, git, command, bin } from "./helpers.mjs";

async function repo(t, options) {
  const f = await fixture(options);
  t.after(() => rm(f.directory, { recursive: true, force: true }));
  return f;
}

test("all three agents use the shared diff engine without model calls", async t => {
  for (const agent of ["claude", "opencode", "codex"]) {
    const f = await repo(t);
    await f.file("src/index.ts", "export const answer = 42;\n");
    const result = await autoCommit(f.request({ agent }));
    assert.equal(result.status, "committed", JSON.stringify(result));
    assert.equal(result.message, "feat: add src/index.ts");
    assert.equal(git(f.cwd, "status", "--porcelain"), "");
    assert.equal(git(f.cwd, "log", "-1", "--format=%s").trim(), result.message);
    assert.equal((await autoCommit(f.request({ agent }))).status, "skipped");
  }
});

test("staged-only mode preserves unstaged hunks and unrelated untracked files", async t => {
  const f = await repo(t);
  await f.file("src/a.ts", "first\n");
  git(f.cwd, "add", ".");
  await f.file("src/a.ts", "first\nsecond\n");
  await f.file("unrelated.txt");
  const result = await autoCommit(f.request({ overrides: { staging: "staged" } }));
  assert.equal(result.status, "committed", JSON.stringify(result));
  assert.equal(git(f.cwd, "show", "HEAD:src/a.ts"), "first\n");
  assert.match(git(f.cwd, "status", "--porcelain"), / M src\/a.ts/);
  assert.match(git(f.cwd, "status", "--porcelain"), /\?\? unrelated.txt/);
});

test("configuration precedence, per-agent policy, and event filtering work", async t => {
  const f = await repo(t);
  await writeFile(join(f.configHome, "config.json"), JSON.stringify({ enabled: false, skipHooks: false }));
  await f.file(".coding-git-autocommit.json", JSON.stringify({ enabled: true, agents: { codex: { enabled: false } } }));
  await f.file("a.txt");
  assert.equal((await autoCommit(f.request())).reason, "Disabled by configuration");
  assert.equal(git(f.cwd, "diff", "--cached", "--name-only"), "");
  assert.equal((await autoCommit(f.request({ agent: "claude", overrides: { events: { failure: false } }, outcome: "failure" }))).reason, "Disabled event: failure");
  assert.equal((await autoCommit(f.request({ agent: "claude" }))).status, "committed");
});

test("invalid policy fails before staging and never turns into permissive defaults", async t => {
  const f = await repo(t);
  await f.file(".coding-git-autocommit.json", '{"enabled":"false"}');
  await f.file("a.txt");
  const result = await autoCommit(f.request());
  assert.equal(result.status, "error");
  assert.match(result.reason, /enabled must be boolean/);
  assert.equal(git(f.cwd, "diff", "--cached", "--name-only"), "");
});

test("Git hooks are respected when requested; legacy bypass is configurable", async t => {
  const f = await repo(t);
  const hook = join(f.cwd, ".git/hooks/pre-commit");
  await writeFile(hook, "#!/bin/sh\nexit 1\n");
  await chmod(hook, 0o755);
  await f.file("a.txt");
  assert.equal((await autoCommit(f.request({ overrides: { skipHooks: false } }))).status, "error");
  assert.equal((await autoCommit(f.request())).status, "committed");
});

test("merge operations and unresolved conflicts are left untouched", async t => {
  const f = await repo(t);
  await f.file("a.txt", "base\n");
  await autoCommit(f.request());
  git(f.cwd, "checkout", "-b", "other");
  await f.file("a.txt", "other\n");
  git(f.cwd, "commit", "-am", "other");
  git(f.cwd, "checkout", "main");
  await f.file("a.txt", "main\n");
  git(f.cwd, "commit", "-am", "main");
  assert.throws(() => git(f.cwd, "merge", "other"));
  const before = git(f.cwd, "ls-files", "--unmerged");
  const result = await autoCommit(f.request());
  assert.equal(result.status, "skipped");
  assert.match(result.reason, /Git operation in progress/);
  assert.equal(git(f.cwd, "ls-files", "--unmerged"), before);
});

test("Git-ignored files, renames, tabs, newlines, Unicode, and binary paths survive parsing", async t => {
  const f = await repo(t);
  await f.file(".gitignore", "ignored.txt\n");
  await f.file("ignored.txt");
  await f.file("src/with\ttab\nand-ü.ts");
  await f.file("binary.dat", Buffer.from([0, 1, 2]));
  assert.equal((await autoCommit(f.request())).status, "committed");
  assert(!git(f.cwd, "ls-files").includes("ignored.txt"));
  git(f.cwd, "mv", "src/with\ttab\nand-ü.ts", "src/renamed\tü.ts");
  const result = await autoCommit(f.request());
  assert.equal(result.status, "committed", JSON.stringify(result));
  assert.equal(result.message, "fix: update src/renamed ü.ts");
  assert.deepEqual(parseChanges("R100\0old\tname\0new\nname\0"), [{ status: "R100", file: "new\nname" }]);
  assert.equal(Array.from(messageFromChanges([{ status: "A", file: "😀".repeat(100) }])).length, 72);
});

test("representative messages preserve the original classification rules", () => {
  for (const [file, status, expected] of [
    ["test/a.test.ts", "A", "test: update test/a.test.ts"],
    ["docs/guide.md", "M", "docs: update docs/guide.md"],
    ["package-lock.json", "M", "chore: update package-lock.json"],
    ["src/a.ts", "D", "chore: remove src/a.ts"],
  ]) assert.equal(messageFromChanges([{ file, status }]), expected);
  assert.equal(messageFromChanges([{ file: "docs/a.md", status: "M" }, { file: "src/a.ts", status: "M" }]), "fix: update src/a.ts and docs/a.md");
});

test("a turn ID deduplicates repeated delivery without suppressing later session turns", async t => {
  const f = await repo(t);
  await f.file("a.txt");
  const request = f.request({ sessionId: "session", turnId: "turn-1" });
  assert.equal((await autoCommit(request)).status, "committed");
  await f.file("a.txt", "later edit\n");
  assert.equal((await autoCommit(request)).reason, "Execution already processed");
  assert.equal((await autoCommit({ ...request, turnId: "turn-2" })).status, "committed");
  assert.equal(git(f.cwd, "rev-list", "--count", "HEAD").trim(), "2");
});

test("simultaneous hook processes across agents create one commit and release the lock", async t => {
  const f = await repo(t);
  await f.file("a.txt");
  const results = await Promise.all(Array.from({ length: 6 }, (_, i) => command([bin, "hook", i % 2 ? "claude" : "codex"], {
    cwd: f.cwd, input: JSON.stringify({ cwd: f.cwd, hook_event_name: "Stop", session_id: "session", turn_id: "turn" }),
    env: { XDG_CONFIG_HOME: f.directory },
  })));
  for (const result of results) {
    assert.equal(result.code, 0, result.stderr);
    assert.equal(result.stdout, "");
    assert(!result.stderr.includes('"status":"error"'), result.stderr);
  }
  assert.equal(git(f.cwd, "rev-list", "--count", "HEAD").trim(), "1");
  assert(!(await readdir(join(f.cwd, ".git"))).includes("coding-git-autocommit.lock"));
});

test("an occupied lock is never stolen from a potentially slow owner", async t => {
  const f = await repo(t);
  await mkdir(join(f.cwd, ".git/coding-git-autocommit.lock"));
  await f.file("a.txt");
  const result = await autoCommit(f.request({ overrides: { lockTimeoutMs: 25 } }));
  assert.match(result.reason, /repository lock/);
  assert.equal(git(f.cwd, "diff", "--cached", "--name-only"), "");
});

test("repository initialization is explicit, and OpenCode's legacy default can be overridden", async t => {
  const f = await repo(t, { initialize: false });
  await f.file("a.txt");
  assert.equal((await autoCommit(f.request())).reason, "Not a Git working tree");
  await f.file(".coding-git-autocommit.json", '{"autoInit":false}');
  assert.equal((await autoCommit(f.request({ agent: "opencode", defaults: { autoInit: true } }))).reason, "Not a Git working tree");
  await f.file(".coding-git-autocommit.json", '{"autoInit":true}');
  const result = await autoCommit(f.request());
  assert.equal(result.status, "committed", JSON.stringify(result));
});

test("linked worktrees resolve their own index and lock location", async t => {
  const f = await repo(t);
  await f.file("a.txt");
  await autoCommit(f.request());
  const worktree = join(f.directory, "linked");
  git(f.cwd, "worktree", "add", "-b", "linked", worktree);
  await writeFile(join(worktree, "linked.txt"), "linked\n");
  const result = await autoCommit(f.request({ cwd: worktree }));
  assert.equal(result.status, "committed", JSON.stringify(result));
  assert.equal(git(f.cwd, "log", "-1", "--format=%s").trim(), "feat: add a.txt");
  assert.equal(git(worktree, "log", "-1", "--format=%s").trim(), "feat: add linked.txt");
});

test("subdirectory execution still stages repository-wide changes", async t => {
  const f = await repo(t);
  await mkdir(join(f.cwd, "nested"));
  await f.file("outside.txt");
  const result = await autoCommit(f.request({ cwd: join(f.cwd, "nested") }));
  assert.equal(result.status, "committed", JSON.stringify(result));
  assert.equal(await readFile(join(f.cwd, "outside.txt"), "utf8"), "example\n");
});

test("inherited Git repository/index variables cannot redirect a hook to another working tree", async t => {
  const f = await repo(t);
  const other = await repo(t);
  await f.file("intended.txt");
  await other.file("unrelated.txt");
  const result = await command([bin, "hook", "codex"], {
    input: JSON.stringify({ cwd: f.cwd, hook_event_name: "Stop" }),
    env: { XDG_CONFIG_HOME: f.directory, GIT_DIR: join(other.cwd, ".git"), GIT_WORK_TREE: other.cwd, GIT_INDEX_FILE: join(other.cwd, ".git/index") },
  });
  assert.equal(result.code, 0);
  assert.match(result.stderr, /"status":"committed"/);
  assert.equal(git(f.cwd, "log", "-1", "--format=%s").trim(), "feat: add intended.txt");
  assert.equal(git(other.cwd, "diff", "--cached", "--name-only"), "");
  assert.throws(() => git(other.cwd, "rev-parse", "HEAD"));
});

test("missing Git identity gets a command-local fallback without writing user configuration", async t => {
  const f = await repo(t);
  git(f.cwd, "config", "--unset", "user.name");
  git(f.cwd, "config", "--unset", "user.email");
  await f.file("a.txt");
  const result = await command([bin, "hook", "codex"], {
    input: JSON.stringify({ cwd: f.cwd, hook_event_name: "Stop" }),
    env: { XDG_CONFIG_HOME: f.directory, GIT_AUTHOR_NAME: "", GIT_COMMITTER_NAME: "", GIT_AUTHOR_EMAIL: "", GIT_COMMITTER_EMAIL: "" },
  });
  assert.equal(result.code, 0);
  // Explicitly empty identity variables must not suppress command-local fallbacks.
  assert.match(result.stderr, /"status":"committed"/);
  assert.equal(git(f.cwd, "log", "-1", "--format=%ae").trim(), "coding-git-autocommit@localhost");
  assert.throws(() => git(f.cwd, "config", "--get", "user.email"));
});

test("trailing whitespace in directory names cannot redirect commits to a neighboring repository", async t => {
  const f = await repo(t);
  const neighbor = f.cwd + " \n";
  await mkdir(neighbor);
  git(neighbor, "init", "-b", "main");
  git(neighbor, "config", "user.name", "Test");
  git(neighbor, "config", "user.email", "test@example.invalid");
  git(neighbor, "config", "commit.gpgsign", "false");
  await f.file("unrelated.txt");
  await writeFile(join(neighbor, "intended.txt"), "example\n");
  const result = await autoCommit(f.request({ cwd: neighbor }));
  assert.equal(result.status, "committed", JSON.stringify(result));
  assert.equal(git(neighbor, "log", "-1", "--format=%s").trim(), "feat: add intended.txt");
  assert.equal(git(f.cwd, "diff", "--cached", "--name-only"), "");
});
