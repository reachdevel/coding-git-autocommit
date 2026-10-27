import { execFileSync, spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const metadata = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
const dryRun = process.argv.includes("--dry-run");
if (!dryRun && process.env.GITHUB_ACTIONS !== "true") {
  throw new Error("Releases run from .github/workflows/publish.yml; use --dry-run locally.");
}
if (metadata.name !== "coding-git-autocommit" || metadata.private || metadata.workspaces ||
  metadata.repository?.url !== "git+https://github.com/reachdevel/coding-git-autocommit.git" ||
  Object.keys(metadata.dependencies ?? {}).length || Object.keys(metadata.optionalDependencies ?? {}).length ||
  Object.keys(metadata.peerDependencies ?? {}).length) {
  throw new Error("Release must contain only the standalone coding-git-autocommit package, with no runtime dependencies.");
}
if (process.env.GITHUB_REF_TYPE === "tag" && process.env.GITHUB_REF_NAME !== `v${metadata.version}`) {
  throw new Error("Release tag must match the package version.");
}
const specification = `${metadata.name}@${metadata.version}`;
const result = spawnSync("npm", ["view", specification, "version", "--json"], { cwd: root, encoding: "utf8" });
if (result.status === 0) {
  console.log(`Already published: ${specification}`);
} else {
  let error;
  try { error = JSON.parse(result.stdout)?.error; } catch { /* retain diagnostic below */ }
  if (error?.code !== "E404") throw new Error(`Cannot check ${specification}: ${result.stderr || result.error || result.stdout}`);
  if (dryRun) {
    console.log(`Would publish only ${specification} (public, latest)`);
  } else {
    execFileSync("npm", ["publish", "--access", "public", "--tag", "latest", "--ignore-scripts"], { cwd: root, stdio: "inherit" });
  }
}
