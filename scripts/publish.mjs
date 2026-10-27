import { execFileSync, spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const folders = ["core", "claude-git-autocommit", "opencode-git-autocommit", "codex-git-autocommit"];
const packages = await Promise.all(folders.map(async folder => ({
  folder, ...JSON.parse(await readFile(join(root, "packages", folder, "package.json"), "utf8")),
})));
const dryRun = process.argv.includes("--dry-run");
if (!dryRun && process.env.GITHUB_ACTIONS !== "true") {
  throw new Error("Releases run from .github/workflows/publish.yml; use --dry-run locally.");
}
const repository = "git+https://github.com/reachdevel/coding-git-autocommit.git";
const engine = packages[0];
if (process.env.GITHUB_REF_TYPE === "tag" && process.env.GITHUB_REF_NAME !== `v${engine.version}`) {
  throw new Error("Release tag must match the shared engine version.");
}
for (const metadata of packages) {
  if (metadata.private || metadata.name.startsWith("@") || metadata.repository?.url !== repository) {
    throw new Error(`Invalid public package metadata: ${metadata.name}`);
  }
  if (metadata !== engine && metadata.dependencies?.[engine.name] !== engine.version) {
    throw new Error(`${metadata.name} must depend on ${engine.name}@${engine.version}`);
  }
}
for (const metadata of packages) {
  const specification = `${metadata.name}@${metadata.version}`;
  const result = spawnSync("npm", ["view", specification, "version", "--json"], { cwd: root, encoding: "utf8" });
  if (result.status === 0) {
    console.log(`Already published: ${specification}`);
    continue;
  }
  let error;
  try { error = JSON.parse(result.stdout)?.error; } catch { /* retain diagnostic below */ }
  if (error?.code !== "E404") throw new Error(`Cannot check ${specification}: ${result.stderr || result.error || result.stdout}`);
  if (dryRun) { console.log(`Would publish ${specification} (public, latest)`); continue; }
  execFileSync("npm", ["publish", "--workspace", metadata.name, "--access", "public", "--tag", "latest", "--ignore-scripts"], {
    cwd: root, stdio: "inherit",
  });
}
