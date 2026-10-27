export interface Change { status: string; file: string }

const TEST_RE = /(^|\/)(tests?|__tests__|spec)\/|\.(test|spec)\.[cm]?[jt]sx?$/;
const DOC_RE = /(^|\/)(docs?)\/|\.(md|mdx|rst)$|(^|\/)readme/i;
const BUILD_RE = /(^|\/)(dist|build|out|coverage|\.next|target|vendor)\/|(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|.*\.lock|\.DS_Store|tsconfig.*\.json|.*\.config\.[cm]?[jt]s)$|^\.github\//;

/** NUL-delimited Git output handles spaces, Unicode, tabs, and newlines without quoting. */
export function parseChanges(output: string): Change[] {
  const fields = output.split("\0");
  if (fields.at(-1) === "") fields.pop();
  const changes: Change[] = [];
  for (let i = 0; i < fields.length;) {
    const status = fields[i++];
    let file = fields[i++];
    if (status?.startsWith("R") || status?.startsWith("C")) file = fields[i++];
    if (!status || file === undefined) throw new Error("Incomplete staged Git diff");
    changes.push({ status, file });
  }
  return changes;
}

function rank(file: string): number {
  return BUILD_RE.test(file) ? 3 : DOC_RE.test(file) ? 2 : TEST_RE.test(file) ? 1 : 0;
}

export function messageFromChanges(changes: readonly Change[]): string | undefined {
  if (!changes.length) return undefined;
  const all = (regex: RegExp) => changes.every(({ file }) => regex.test(file));
  const deleted = changes.every(({ status }) => status.startsWith("D"));
  const type = all(TEST_RE) ? "test" : all(DOC_RE) ? "docs" : all(BUILD_RE) || deleted ? "chore"
    : changes.every(({ status }) => status.startsWith("A")) ? "feat" : "fix";
  const files = [...changes].sort((a, b) => rank(a.file) - rank(b.file) || a.file.length - b.file.length
    || (a.file < b.file ? -1 : a.file > b.file ? 1 : 0)).map(({ file }) => file);
  const description = files.length === 1 ? files[0] : files.length === 2 ? `${files[0]} and ${files[1]}`
    : `${files[0]} and ${files.length - 1} more files`;
  const subject = `${type}: ${deleted ? "remove" : type === "feat" ? "add" : "update"} ${description}`
    .replace(/[\x00-\x1f\x7f]/g, " ");
  const characters = Array.from(subject);
  return characters.length > 72 ? characters.slice(0, 69).join("").trimEnd() + "..." : subject;
}
