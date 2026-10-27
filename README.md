# Coding Git Autocommit

One deterministic Git autocommit engine for Claude Code, OpenCode v2, and Codex.
Commit messages come from the staged diff, with no model calls or API costs.

The only package to install is
[`coding-git-autocommit`](https://www.npmjs.com/package/coding-git-autocommit).
The shared Git engine and all three host integrations live inside this package.
It has no third-party runtime dependencies and does not import or execute any
predecessor package. Source:
[`reachdevel/coding-git-autocommit`](https://github.com/reachdevel/coding-git-autocommit).

## Structure

```text
src/
  engine.ts                 shared Git operations, locking, and commit messages
  cli.ts                    installation and manual-commit commands
  adapters/
    hooks.ts                Claude Code and Codex lifecycle handling
    opencode.ts             OpenCode event handling
    opencode-plugin.ts      bundled native OpenCode plugin entry point
dist/                       compiled standalone runtime
hooks/                      separate Claude and Codex native plugin hooks
.claude-plugin/             Claude plugin and marketplace
.codex-plugin/              Codex plugin manifest
.agents/plugins/            Codex marketplace
test/                       disposable-repository integration tests
package.json                the sole npm package
```

The OpenCode SDK is a development dependency used to check compatibility. The
published OpenCode plugin, like the other integrations, needs no SDK installation.

## Development

Requires Node.js 20+, npm, and Git. POSIX shells are
required for the generated Claude/Codex hook commands; Windows users need WSL.

```sh
npm ci
npm run check
```

`npm run check` typechecks, builds, tests real Git behavior and hook adapters,
checks the actual OpenCode SDK contract, and installs only the standalone tarball
in an isolated temporary directory. That installed package must create real Git
commits through all three host integrations without any predecessor package. Dependency lifecycle scripts are not required;
`npm ci --ignore-scripts` is also supported. Compiled `dist/` is
included so Git-installed native plugins can run without a build step.

## Install from npm

Choose an agent and scope explicitly. Preview a standalone installation first:

```sh
npx coding-git-autocommit install codex --project --dry-run
npx coding-git-autocommit install codex --project
npx coding-git-autocommit install claude --user
npx coding-git-autocommit install opencode --project
```

For OpenCode v2's native npm-plugin route, the same package exports the plugin
directly:

```sh
opencode plugin add coding-git-autocommit@latest
```

Use either this native npm route or the standalone local-plugin installer above.

## Installation from a checkout

Building the project does not activate any integration. Choose the agent and
scope explicitly. Preview first with `--dry-run`:

```sh
node dist/bin.js install codex --project --dry-run
node dist/bin.js install codex --project
node dist/bin.js install claude --user
node dist/bin.js install opencode --project
```

Run project-scoped commands from the project root. The installer copies the
complete, dependency-free runtime beside host configuration, so deleting an
`npx` cache or moving this source checkout does not break installed hooks.

| Agent | Project installation | User installation | Trigger |
| --- | --- | --- | --- |
| Claude Code | `.claude/settings.json` | `~/.claude/settings.json` | `Stop`, `StopFailure` |
| Codex | `.codex/hooks.json` | `~/.codex/hooks.json` | `Stop` |
| OpenCode v2 | `.opencode/plugins/coding-git-autocommit.js` | `~/.config/opencode/plugins/coding-git-autocommit.js` | `session.execution.succeeded`, `.failed`, `.interrupted` |

OpenCode honors `XDG_CONFIG_HOME`. Existing hook definitions are preserved;
changed hook files get timestamped backups. Repeat installation replaces only
this adapter's entries. OpenCode's JSON/JSONC config is not edited.
User-scope installation also honors `CODEX_HOME` and `CLAUDE_CONFIG_DIR` when set.

**Codex:** restart and review/trust the hook with `/hooks`. The installer never
grants trust or bypasses Codex's trust review. Codex has no documented
`StopFailure` hook; this adapter does not register one. It also does not commit
on interruption or session shutdown.

To remove a standalone integration, remove its generated hook entry (or the
OpenCode local plugin file), then remove its host-local
`coding-git-autocommit/` runtime directory. Keep unrelated host hooks intact.

## Native plugin installation

Choose **either** a native plugin **or** the standalone installer per agent;
installing both registers duplicate hooks. After building this checkout:

```sh
# Claude Code GitHub marketplace
claude plugin marketplace add reachdevel/coding-git-autocommit
claude plugin install git-autocommit@coding-git-autocommit

# Codex GitHub marketplace
codex plugin marketplace add https://github.com/reachdevel/coding-git-autocommit.git
codex plugin add git-autocommit@coding-git-autocommit
```

Local checkout paths are also accepted as marketplace sources.
Restart the agent. Codex additionally requires native hook trust review.
Only the selected host's hook file loads. Native plugin paths use the host's
plugin-root variable; neither native plugin imports the OpenCode SDK.

## Migration from the old packages

`claude-git-autocommit`, `opencode-git-autocommit`, and `codex-git-autocommit` are
superseded by this single package. They are not needed for any integration and
are no longer published from this repository. Existing installed versions remain
available for compatibility while users migrate.

Disable the previous native plugin, standalone hook, or OpenCode package entry
before installing the replacement. For example, remove `opencode-git-autocommit`
from OpenCode's plugin configuration, then add `coding-git-autocommit` or use
`npx coding-git-autocommit install opencode --project`.

For recognized old Claude standalone hook commands in the **same settings
file**, `--replace-legacy` removes those commands while retaining unrelated
hooks:

```sh
npx coding-git-autocommit install claude --project --replace-legacy
```

This does not disable a separately installed plugin or another scope. The
installer does not change unrelated agent settings.

## Shared configuration

Precedence, lowest to highest:

1. Shared defaults, then adapter compatibility defaults.
2. `~/.config/coding-git-autocommit/config.json` (or `$XDG_CONFIG_HOME/...`).
3. `.coding-git-autocommit.json` at the Git working-tree root.
4. Explicit programmatic/manual-CLI overrides.

Within each configuration file, `agents.<host>` overrides its common options.
Nested event options merge individually. Invalid or unknown options cause the
commit attempt to be skipped with an error diagnostic before staging.
See [schema.json](schema.json) for editor validation.

Example project policy:

```json
{
  "enabled": true,
  "staging": "staged",
  "skipHooks": false,
  "autoInit": false,
  "rootOnly": true,
  "events": { "success": true, "failure": false, "interrupted": false },
  "agents": { "codex": { "enabled": true } }
}
```

For **default OFF, enable per project**, put `{"enabled":false}` in the user
policy and `{"enabled":true}` in each selected project's policy. Hook or plugin
registration alone then does not enable committing in other repositories.

| Option | Default | Meaning |
| --- | --- | --- |
| `enabled` | `true` | Whether the installed adapter may commit |
| `staging` | `"all"` | Stage the whole worktree, or use `"staged"` to commit only the current index |
| `skipHooks` | `true` | Pass `--no-verify`, bypassing pre-commit and commit-msg hooks |
| `autoInit` | `false`; OpenCode adapter: `true` | Initialize a non-repository directory, preserving OpenCode's legacy behavior |
| `rootOnly` | `true` | Skip events identified as subagent executions |
| `events.success` | `true` | Allow normal completion events |
| `events.failure` | `true` | Allow failure events where the host supports them |
| `events.interrupted` | `true` | Allow interruption events where the host supports them |
| `lockTimeoutMs` | `5000` | How long to wait for another autocommit process |
| `gitTimeoutMs` | `15000` | Timeout per Git subprocess |

The staging, event, and hook-bypass defaults preserve the original packages'
checkpoint behavior. `staging: "all"` includes unrelated working-tree changes
and everything already staged. This tool does not attribute edits to individual
agents. `staging: "staged"` preserves unstaged hunks but also commits anything
you have already staged.

## Behavior and limits

- Subjects use the original structural Conventional Commit rules: tests-only
  becomes `test`, documentation-only `docs`, build/lock/deletions `chore`,
  additions-only `feat`, and mixed source edits `fix`. They are capped at 72
  Unicode characters. Paths retain punctuation; control characters are replaced.
- Git diffs use NUL-delimited paths, including rename destinations. Ignored
  files remain ignored. Commits never push or amend.
- Existing Git identity is retained. Missing name/email values get command-local
  bot fallbacks; user or repository Git configuration is not changed.
- Conflicts and active merge, rebase, cherry-pick, revert, sequencer, and bisect
  operations are skipped. Bare repositories are not initialized or committed.
- Every adapter uses the same filesystem lock in the worktree's Git directory.
  This coordinates independent processes and agents using this tool. Other Git
  clients and still-enabled legacy plugins do not observe that lock. It prevents
  overlapping commit commands, not simultaneous edits by agents.
- Locks are released on normal completion, including caught Git failures.
  A forcibly killed process can leave `.git/coding-git-autocommit.lock/` behind.
  Check `owner.json` and verify the process has ended before manually removing
  that directory. The engine never steals a potentially live lock.
- Codex turn IDs and OpenCode durable event IDs deduplicate successful commits
  across repeated delivery (the most recent 128 identities). Claude inputs
  without a turn ID rely on the clean-index check. Session ID alone is never
  used to deduplicate: sessions contain multiple turns.
- OpenCode resolves `parentID` before committing. If lookup fails, its legacy
  fallback permits a commit and logs the uncertainty. Claude/Codex skip known
  child metadata and do not register `SubagentStop`; missing metadata cannot
  establish ownership. Hook continuations and planning mode are skipped.
- A terminal host event is a checkpoint trigger. It does not prove the task is
  complete or tests passed. The engine does not run a model or infer test status.
- Hook adapters always exit zero and keep stdout empty. Failures are reported
  on stderr without preventing the host from finishing. The explicit manual
  command returns a failing exit code for engine errors:

```sh
node dist/bin.js commit codex --cwd /path/to/project --staged --respect-hooks
```

## License

MIT. Original copyright is preserved; see [NOTICE](NOTICE) for provenance.

## Releases

`.github/workflows/publish.yml` publishes only `coding-git-autocommit` from
GitHub-hosted runners using the existing npm OIDC trusted-publisher connection.
The workflow runs the full verification suite and checks committed build
artifacts before publishing. No npm publish token is stored in the repository.

For a release, update the root package and native plugin manifest versions,
refresh the lockfile with `npm install --package-lock-only --ignore-scripts`,
and run `npm run check`. Commit the metadata and generated `dist/` artifacts,
then push a `v<package-version>` tag. The workflow can also be rerun manually;
an already-published version is skipped.

The npm trusted-publisher configuration authorizes
`reachdevel/coding-git-autocommit`, workflow filename `publish.yml`.
