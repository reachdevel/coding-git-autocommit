import { copyFile, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
for (const name of ["core", "claude-git-autocommit", "opencode-git-autocommit", "codex-git-autocommit"]) {
  await copyFile(join(root, "LICENSE"), join(root, "packages", name, "LICENSE"));
}
for (const file of ["README.md", "schema.json", "NOTICE"]) {
  await copyFile(join(root, file), join(root, "packages/core", file));
}
const metadata = JSON.parse(await readFile(join(root, "packages/core/package.json"), "utf8"));
await writeFile(join(root, "packages/core/src/version.ts"),
  '// Generated from packages/core/package.json by scripts/sync-metadata.mjs.\n' +
  `export const VERSION = ${JSON.stringify(metadata.version)};\n`);
