import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const temporary = await mkdtemp(join(tmpdir(), "coding-autocommit-pack-"));
const engineMetadata = JSON.parse(await readFile(join(root, "packages/core/package.json"), "utf8"));
const cache = process.env.npm_config_cache || execFileSync("npm", ["config", "get", "cache"], { encoding: "utf8" }).trim();
function npm(args, cwd = root) {
  return execFileSync("npm", [...args, "--cache", cache], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

try {
  execFileSync(process.execPath, [join(root, "node_modules/typescript/bin/tsc"), "--noEmit", "--module", "NodeNext", "--moduleResolution", "NodeNext", "--target", "ES2022", "--skipLibCheck", join(root, "scripts/sdk-contract.ts")], { cwd: root, stdio: "inherit" });
  const names = ["coding-git-autocommit", "claude-git-autocommit", "opencode-git-autocommit", "codex-git-autocommit"];
  const packs = [];
  for (const name of names) {
    const [pack] = JSON.parse(npm(["pack", "--workspace", name, "--ignore-scripts", "--json", "--pack-destination", temporary]));
    assert(pack.files.some(file => file.path === "LICENSE"), `${name} must ship its license`);
    assert(pack.files.some(file => file.path === "README.md"), `${name} must ship usage documentation`);
    if (name === "coding-git-autocommit") {
      for (const required of ["dist/bin.js", "dist/engine.js", "dist/adapters/hooks.js", "dist/adapters/opencode.js", "schema.json"]) {
        assert(pack.files.some(file => file.path === required), `Missing ${required}`);
      }
    }
    packs.push(join(temporary, pack.filename));
  }
  await writeFile(join(temporary, "package.json"), '{"private":true,"type":"module"}\n');
  npm(["install", "--offline", "--ignore-scripts", "--no-audit", "--no-fund", ...packs], temporary);
  const probe = join(temporary, "probe.mjs");
  await writeFile(probe, [
    'import assert from "node:assert/strict";',
    'import { autoCommit } from "coding-git-autocommit";',
    'import plugin from "opencode-git-autocommit";',
    'assert.equal(typeof autoCommit, "function");',
    'assert.equal(plugin.id, "git-autocommit");',
    'assert.equal(typeof plugin.setup, "function");',
  ].join("\n"));
  execFileSync(process.execPath, [probe], { cwd: temporary, stdio: "inherit" });
  for (const name of ["claude-git-autocommit", "codex-git-autocommit"]) {
    const help = execFileSync(process.execPath, [join(temporary, "node_modules", name, "install.js"), "--help"], { encoding: "utf8" });
    assert(help.includes("coding-git-autocommit install"));
    const version = execFileSync(process.execPath, [join(temporary, "node_modules", name, "install.js"), "--version"], { encoding: "utf8" }).trim();
    const metadata = JSON.parse(await readFile(join(temporary, "node_modules", name, "package.json"), "utf8"));
    assert.equal(version, metadata.version);
  }
  const lock = JSON.parse(await readFile(join(temporary, "package-lock.json"), "utf8"));
  assert.equal(lock.packages["node_modules/coding-git-autocommit"].version, engineMetadata.version);
  const coreVersion = execFileSync(process.execPath, [join(temporary, "node_modules/coding-git-autocommit/dist/bin.js"), "--version"], { encoding: "utf8" }).trim();
  assert.equal(coreVersion, engineMetadata.version);
  console.log("All four npm tarballs install and load independently; OpenCode SDK contract passed.");
} finally {
  await rm(temporary, { recursive: true, force: true });
}
