import { execFileSync, spawn } from "node:child_process";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const project = fileURLToPath(new URL("../", import.meta.url));
export const bin = resolve(project, "dist/bin.js");

export function git(cwd, ...args) {
  return execFileSync("git", ["-C", cwd, ...args], {
    encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" },
  });
}

export async function fixture({ initialize = true } = {}) {
  const directory = await mkdtemp(join(tmpdir(), "coding-autocommit-test-"));
  const cwd = join(directory, "repository");
  const configHome = join(directory, "config");
  await mkdir(cwd);
  await mkdir(configHome);
  if (initialize) {
    git(cwd, "init", "-b", "main");
    git(cwd, "config", "user.name", "Autocommit Test");
    git(cwd, "config", "user.email", "autocommit-test@example.invalid");
    git(cwd, "config", "commit.gpgsign", "false");
    git(cwd, "config", "core.hooksPath", join(cwd, ".git", "hooks"));
  }
  return {
    directory, cwd, configHome,
    request: (overrides = {}) => ({ cwd, agent: "codex", outcome: "success", configHome, ...overrides }),
    async file(path, content = "example\n") {
      const full = join(cwd, path);
      await mkdir(resolve(full, ".."), { recursive: true });
      await writeFile(full, content);
    },
  };
}

export function command(args, { cwd = project, input = "", env = {} } = {}) {
  return new Promise((resolve, reject) => {
    const process_ = spawn(process.execPath, args, {
      cwd, env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1", ...env },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "", stderr = "";
    process_.stdout.on("data", data => { stdout += data; });
    process_.stderr.on("data", data => { stderr += data; });
    process_.on("error", reject);
    process_.on("close", code => resolve({ code, stdout, stderr }));
    process_.stdin.on("error", () => {});
    process_.stdin.end(input);
  });
}
