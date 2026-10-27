#!/usr/bin/env node
import { runCli } from "coding-git-autocommit/cli";
import { readFile } from "node:fs/promises";
const args = process.argv.slice(2);
if (args.length === 1 && ["--version", "-v"].includes(args[0])) {
  console.log(JSON.parse(await readFile(new URL("./package.json", import.meta.url), "utf8")).version);
} else {
  process.exitCode = await runCli(["install", "claude", ...args]);
}
