import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);

function gitEnvironment(): NodeJS.ProcessEnv {
  const env = { ...process.env, GIT_TERMINAL_PROMPT: "0" };
  // A host launched from a Git hook may inherit a different index or repository.
  for (const key of ["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_COMMON_DIR", "GIT_OBJECT_DIRECTORY", "GIT_ALTERNATE_OBJECT_DIRECTORIES", "GIT_PREFIX"]) {
    delete (env as NodeJS.ProcessEnv)[key];
  }
  for (const key of ["GIT_AUTHOR_NAME", "GIT_AUTHOR_EMAIL", "GIT_COMMITTER_NAME", "GIT_COMMITTER_EMAIL"]) {
    if (!env[key as keyof typeof env]?.trim()) delete (env as NodeJS.ProcessEnv)[key];
  }
  return env;
}

export async function git(cwd: string, args: string[], timeout = 15_000): Promise<string> {
  // Explicit -C and argv keep filenames and paths out of shell evaluation.
  const { stdout } = await exec("git", ["-C", cwd, ...args], {
    cwd, encoding: "utf8", timeout, maxBuffer: 16 * 1024 * 1024,
    env: gitEnvironment(),
  });
  return stdout;
}

export async function repositoryRoot(cwd: string): Promise<string | undefined> {
  try {
    return outputLine(await git(cwd, ["rev-parse", "--show-toplevel"]));
  } catch (error) {
    const failure = error as Error & { code?: number | string; stderr?: string };
    if (failure.code === 128 && failure.stderr?.includes("not a git repository")) return undefined;
    throw error;
  }
}

/** Remove Git's record separator, not whitespace belonging to a directory name. */
export function outputLine(output: string): string {
  return output.endsWith("\n") ? output.slice(0, -1) : output;
}

export async function optionalGit(cwd: string, args: string[], timeout: number): Promise<string> {
  try { return (await git(cwd, args, timeout)).trim(); }
  catch (error) {
    if ((error as { code?: number }).code === 1) return "";
    throw error;
  }
}
