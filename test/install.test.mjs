import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { install } from "../dist/install.js";
import { fixture, git } from "./helpers.mjs";

async function setup(t) {
  const f = await fixture();
  t.after(() => rm(f.directory, { recursive: true, force: true }));
  return f;
}

test("dry-run creates no directories or configuration for any adapter", async t => {
  const f = await setup(t);
  const before = await readdir(f.cwd);
  for (const agent of ["claude", "codex", "opencode"]) {
    const plan = await install({ agent, scope: "project", cwd: f.cwd, dryRun: true });
    assert.equal(plan.dryRun, true);
    await assert.rejects(stat(plan.target), { code: "ENOENT" });
  }
  assert.deepEqual(await readdir(f.cwd), before);
});

test("installation preserves existing hooks, backs up edits, and is idempotent", async t => {
  const f = await setup(t);
  await mkdir(join(f.cwd, ".codex"));
  const target = join(f.cwd, ".codex/hooks.json");
  const original = JSON.stringify({ description: "Keep me", hooks: {
    Stop: [{ matcher: "", hooks: [{ type: "command", command: "echo existing" }] }],
    SessionStart: [{ hooks: [{ type: "command", command: "echo start" }] }],
  } }, null, 2) + "\n";
  await writeFile(target, original);
  const first = await install({ agent: "codex", scope: "project", cwd: f.cwd });
  assert.equal(first.changed, true);
  const settings = JSON.parse(await readFile(target, "utf8"));
  assert.equal(settings.description, "Keep me");
  assert.equal(settings.hooks.Stop.length, 2);
  assert.equal(settings.hooks.SessionStart[0].hooks[0].command, "echo start");
  assert.equal(settings.hooks.StopFailure, undefined);
  assert.equal(settings.hooks.state, undefined);
  assert(first.notes.some(note => note.includes("trust")));
  const backups = (await readdir(join(f.cwd, ".codex"))).filter(name => name.includes("backup"));
  assert.equal(backups.length, 1);
  assert.equal(await readFile(join(f.cwd, ".codex", backups[0]), "utf8"), original);
  assert.equal((await install({ agent: "codex", scope: "project", cwd: f.cwd })).changed, false);
  assert.equal(JSON.parse(await readFile(target, "utf8")).hooks.Stop.length, 2);
});

test("Claude compatibility installer preserves legacy hooks unless replacement is explicit", async t => {
  const f = await setup(t);
  await mkdir(join(f.cwd, ".claude"));
  const target = join(f.cwd, ".claude/settings.json");
  await writeFile(target, JSON.stringify({ permissions: { allow: ["Read"] }, hooks: {
    Stop: [{ hooks: [{ type: "command", command: "/old/claude-git-autocommit/dist/commit-from-diff.mjs" },
      { type: "command", command: "/unrelated/hook.sh" }] }],
  } }));
  await install({ agent: "claude", scope: "project", cwd: f.cwd });
  let settings = JSON.parse(await readFile(target, "utf8"));
  assert.equal(settings.hooks.Stop.length, 2);
  await install({ agent: "claude", scope: "project", cwd: f.cwd, replaceLegacy: true });
  settings = JSON.parse(await readFile(target, "utf8"));
  assert.deepEqual(settings.permissions, { allow: ["Read"] });
  assert.equal(settings.hooks.Stop[0].hooks.length, 1);
  assert.equal(settings.hooks.Stop[0].hooks[0].command, "/unrelated/hook.sh");
  assert.equal(settings.hooks.StopFailure.length, 1);
});

test("copied runtime runs independently of the package installation, with shell-safe paths", async t => {
  const f = await setup(t);
  const cwd = join(f.directory, "project ' quote $(touch SHOULD_NOT_EXIST)");
  await mkdir(cwd);
  git(cwd, "init", "-b", "main");
  git(cwd, "config", "user.name", "Test");
  git(cwd, "config", "user.email", "test@example.invalid");
  git(cwd, "config", "commit.gpgsign", "false");
  const plan = await install({ agent: "codex", scope: "project", cwd });
  await writeFile(join(cwd, "a.txt"), "example\n");
  const settings = JSON.parse(await readFile(plan.target, "utf8"));
  const stdout = execFileSync("/bin/sh", ["-c", settings.hooks.Stop[0].hooks[0].command], {
    cwd, input: JSON.stringify({ cwd, hook_event_name: "Stop" }), encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env, XDG_CONFIG_HOME: f.directory, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" },
  });
  assert.equal(stdout, "");
  assert.equal(git(cwd, "status", "--porcelain"), "");
  await assert.rejects(stat(join(cwd, "SHOULD_NOT_EXIST")), { code: "ENOENT" });
});

test("OpenCode local installation avoids editing JSONC configuration and has no SDK runtime dependency", async t => {
  const f = await setup(t);
  await mkdir(join(f.cwd, ".opencode"));
  await writeFile(join(f.cwd, "opencode.jsonc"), "// keep comments\n{}\n");
  const plan = await install({ agent: "opencode", scope: "project", cwd: f.cwd });
  assert.equal(await readFile(join(f.cwd, "opencode.jsonc"), "utf8"), "// keep comments\n{}\n");
  const text = await readFile(plan.target, "utf8");
  assert(!text.includes('from "@opencode/plugin"'));
  // Give Node the same ESM treatment the host gives local plugin files.
  await writeFile(join(f.cwd, ".opencode/package.json"), '{"type":"module"}');
  const { default: plugin } = await import(pathToFileURL(plan.target).href);
  assert.equal(plugin.id, "git-autocommit");
  assert.equal(typeof plugin.setup, "function");
});

test("invalid existing hook files are rejected without replacing their contents", async t => {
  const f = await setup(t);
  await mkdir(join(f.cwd, ".codex"));
  const target = join(f.cwd, ".codex/hooks.json");
  await writeFile(target, "invalid JSON");
  await assert.rejects(install({ agent: "codex", scope: "project", cwd: f.cwd }));
  assert.equal(await readFile(target, "utf8"), "invalid JSON");
});

test("user-scope installation can be isolated without touching actual agent settings", async t => {
  const f = await setup(t);
  const home = join(f.directory, "fake-home");
  for (const agent of ["claude", "codex", "opencode"]) {
    const plan = await install({ agent, scope: "user", home });
    assert(plan.target.startsWith(home));
    assert((await stat(plan.target)).isFile());
  }
});
