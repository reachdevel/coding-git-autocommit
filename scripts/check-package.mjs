import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Host } from "@opencode/plugin/host";

const root = fileURLToPath(new URL("../", import.meta.url));
const temporary = await mkdtemp(join(tmpdir(), "coding-autocommit-package-"));
const metadata = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
const cache = process.env.npm_config_cache || execFileSync("npm", ["config", "get", "cache"], { encoding: "utf8" }).trim();
function npm(args, cwd = root) {
  return execFileSync("npm", [...args, "--cache", cache], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

try {
  assert.equal(metadata.name, "coding-git-autocommit");
  assert.equal(metadata.workspaces, undefined);
  for (const key of ["dependencies", "optionalDependencies", "peerDependencies"]) {
    assert.equal(Object.keys(metadata[key] ?? {}).length, 0, `Unexpected runtime dependency in ${key}`);
  }
  execFileSync(process.execPath, [join(root, "node_modules/typescript/bin/tsc"), "--noEmit", "--strict", "--module", "NodeNext", "--moduleResolution", "NodeNext", "--target", "ES2022", "--skipLibCheck", join(root, "scripts/sdk-contract.ts")], { cwd: root, stdio: "inherit" });
  const [pack] = JSON.parse(npm(["pack", "--ignore-scripts", "--json", "--pack-destination", temporary]));
  for (const required of ["LICENSE", "README.md", "dist/bin.js", "dist/engine.js", "dist/adapters/hooks.js", "dist/adapters/opencode.js", "dist/adapters/opencode-plugin.js", "schema.json", "hooks/claude.json", "hooks/codex.json"]) {
    assert(pack.files.some(file => file.path === required), `Missing ${required}`);
  }
  assert(!pack.files.some(file => file.path.startsWith("packages/")), "Wrapper packages must not be shipped");
  await writeFile(join(temporary, "package.json"), '{"private":true,"type":"module"}\n');
  npm(["install", "--offline", "--ignore-scripts", "--no-audit", "--no-fund", join(temporary, pack.filename)], temporary);
  const installed = await readdir(join(temporary, "node_modules"));
  assert.deepEqual(installed.filter(name => !name.startsWith(".")).sort(), ["coding-git-autocommit"]);
  const server = Host.resolve({ name: "coding-git-autocommit", directory: temporary }).server;
  assert(server, "OpenCode must discover the package's bundled server entry point");
  const loaded = await Host.load(server);
  assert.equal(loaded.default.id, "git-autocommit");
  assert.equal(typeof loaded.default.setup, "function");
  const bin = join(temporary, "node_modules/.bin/coding-git-autocommit");
  assert.equal(execFileSync(bin, ["--version"], { encoding: "utf8" }).trim(), metadata.version);
  const probe = join(temporary, "probe.mjs");
  await writeFile(probe, [
    'import assert from "node:assert/strict";',
    'import { execFileSync } from "node:child_process";',
    'import { mkdir, readFile, writeFile } from "node:fs/promises";',
    'import { join } from "node:path";',
    'import { pathToFileURL } from "node:url";',
    'import plugin, { autoCommit } from "coding-git-autocommit";',
    'import subpathPlugin from "coding-git-autocommit/opencode";',
    'assert.equal(typeof autoCommit, "function");',
    'assert.equal(plugin, subpathPlugin);',
    'assert.equal(plugin.id, "git-autocommit");',
    'const root = process.cwd();',
    'const bin = join(root, "node_modules/coding-git-autocommit/dist/bin.js");',
    'const env = { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1", XDG_CONFIG_HOME: join(root, "config") };',
    'Object.assign(process.env, env);',
    'for (const agent of ["claude", "codex", "opencode"]) {',
    '  const cwd = join(root, "fixture-" + agent);',
    '  await mkdir(cwd);',
    '  const git = (...args) => execFileSync("git", ["-C", cwd, ...args], { env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });',
    '  git("init", "-b", "main");',
    '  git("config", "user.name", "Package Test");',
    '  git("config", "user.email", "package-test@example.invalid");',
    '  git("config", "commit.gpgsign", "false");',
    '  await writeFile(join(cwd, "example.txt"), "standalone package test\\n");',
    '  const plan = JSON.parse(execFileSync(process.execPath, [bin, "install", agent, "--project"], { cwd, env, encoding: "utf8" }));',
    '  if (agent === "opencode") {',
    '    const { default: installedPlugin } = await import(pathToFileURL(plan.target).href);',
    '    let finish;',
    '    const done = new Promise(resolve => { finish = resolve; });',
    '    const dispose = installedPlugin.setup({',
    '      location: { directory: cwd },',
    '      event: { async *subscribe() { yield { id: "event-1", type: "session.execution.succeeded", data: { sessionID: "root" } }; finish(); } },',
    '      session: { get: async () => ({}) },',
    '    });',
    '    await done;',
    '    await dispose();',
    '  } else {',
    '    const settings = JSON.parse(await readFile(plan.target, "utf8"));',
    '    const command = settings.hooks.Stop[0].hooks[0].command;',
    '    const output = execFileSync("/bin/sh", ["-c", command], { cwd, env, input: JSON.stringify({ cwd, hook_event_name: "Stop", session_id: "root", turn_id: "turn-1" }), encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });',
    '    assert.equal(output, "");',
    '  }',
    '  assert.equal(git("rev-list", "--count", "HEAD").trim(), "1");',
    '  assert.equal(git("status", "--porcelain"), "");',
    '}',
  ].join("\n"));
  execFileSync(process.execPath, [probe], { cwd: temporary, stdio: "inherit", timeout: 30_000 });
  console.log("One standalone tarball, no runtime dependencies, OpenCode SDK contract, and all three installed integrations creating real Git commits: passed.");
} finally {
  await rm(temporary, { recursive: true, force: true });
}
