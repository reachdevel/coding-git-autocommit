import test from "node:test";
import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import { createOpenCodeSetup } from "../dist/adapters/opencode.js";
import { runHook } from "../dist/adapters/hooks.js";
import { fixture, git, command, bin } from "./helpers.mjs";

test("hook adapters reject invalid input, unsupported events, planning, and continuations", async t => {
  const f = await fixture();
  t.after(() => rm(f.directory, { recursive: true, force: true }));
  await f.file("a.txt");
  const base = { cwd: f.cwd, hook_event_name: "Stop" };
  for (const payload of [
    { ...base, hook_event_name: "StopFailure" }, { ...base, hook_event_name: "Interrupt" },
    { ...base, hook_event_name: "SubagentStop" }, { ...base, stop_hook_active: true },
    { ...base, permission_mode: "plan" }, { ...base, agent_id: "child" },
  ]) assert.equal((await runHook("codex", JSON.stringify(payload), f.configHome)).status, "skipped");
  assert.equal((await runHook("codex", "broken", f.configHome)).status, "error");
  assert.equal((await runHook("codex", "{}", f.configHome)).status, "skipped");
  const result = await runHook("claude", JSON.stringify({ ...base, hook_event_name: "StopFailure" }), f.configHome);
  assert.equal(result.status, "committed", JSON.stringify(result));
});

test("CLI hooks always exit zero with clean stdout, including commit failures and malformed JSON", async t => {
  const f = await fixture();
  t.after(() => rm(f.directory, { recursive: true, force: true }));
  await f.file(".coding-git-autocommit.json", '{"enabled":"bad"}');
  for (const input of ["not-json", JSON.stringify({ cwd: f.cwd, hook_event_name: "Stop" })]) {
    const result = await command([bin, "hook", "codex"], { input, env: { XDG_CONFIG_HOME: f.directory } });
    assert.equal(result.code, 0);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /error/);
  }
});

test("OpenCode v2 maps terminal events, preserves root-session metadata, and unsubscribes", async () => {
  const requests = [], reports = [];
  let signal;
  let complete;
  const done = new Promise(resolve => { complete = resolve; });
  const setup = createOpenCodeSetup({
    commit: async request => { requests.push(request); return { status: "skipped", reason: "fixture" }; },
    report: result => { reports.push(result); if (reports.length === 4) complete(); },
  });
  const dispose = setup({
    location: { directory: "/fixture" },
    event: { async *subscribe(options) {
      signal = options.signal;
      yield { type: "session.updated" };
      yield { type: "session.execution.succeeded", location: { directory: "/different-project" }, data: { sessionID: "root" } };
      yield { id: "one", type: "session.execution.succeeded", data: { sessionID: "root" } };
      yield { type: "session.execution.failed", data: { sessionID: "root" } };
      yield { type: "session.execution.interrupted", data: { sessionID: "root" } };
      yield { type: "session.execution.succeeded", data: { sessionID: "child" } };
    } },
    session: { get: async ({ sessionID }) => ({ parentID: sessionID === "child" ? "root" : undefined }) },
  });
  await done;
  assert.deepEqual(requests.map(request => request.outcome), ["success", "failure", "interrupted", "success"]);
  assert.equal(requests[0].turnId, "one");
  assert.equal(requests[1].turnId, undefined);
  assert.equal(requests[3].isSubagent, true);
  assert.equal(requests[0].defaults.autoInit, true);
  await dispose();
  assert.equal(signal.aborted, true);
});

test("OpenCode SDK accepts the exported plugin adapter", async () => {
  const { default: plugin, GitAutocommitPlugin } = await import("../dist/index.js");
  const { Plugin } = await import("@opencode/plugin");
  assert.equal(plugin, GitAutocommitPlugin);
  assert.equal(Plugin.define(plugin), plugin);
});

test("OpenCode handles a rejected event stream without an unhandled rejection", async () => {
  let received;
  const done = new Promise(resolve => { received = resolve; });
  const dispose = createOpenCodeSetup({ report: received })({
    location: { directory: "/fixture" },
    event: { async *subscribe() { throw new Error("stream unavailable"); } },
    session: { get: async () => ({}) },
  });
  const result = await done;
  assert.equal(result.status, "error");
  assert.match(result.reason, /stream unavailable/);
  await dispose();
});

test("root-only configuration prevents subagent commits in the shared engine", async t => {
  const f = await fixture();
  t.after(() => rm(f.directory, { recursive: true, force: true }));
  await f.file("a.txt");
  assert.equal((await runHook("claude", JSON.stringify({ cwd: f.cwd, hook_event_name: "Stop", agent_id: "child" }), f.configHome)).reason, "Subagent execution");
  assert.equal(git(f.cwd, "diff", "--cached", "--name-only"), "");
});
