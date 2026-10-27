# Coding Git Autocommit

One deterministic Git autocommit engine for Claude Code, OpenCode v2, and Codex.
Commit messages come from the staged diff, with no model calls or API costs.

This repository is a consolidation of
[claude-git-autocommit](https://github.com/reachdevel/claude-git-autocommit) and
[opencode-git-autocommit](https://github.com/reachdevel/opencode-git-autocommit).
It contains the unscoped npm package
[`coding-git-autocommit`](https://www.npmjs.com/package/coding-git-autocommit)
and three host adapters, maintained at
[`reachdevel/coding-git-autocommit`](https://github.com/reachdevel/coding-git-autocommit).

## Structure

```text
packages/
  core/                       coding-git-autocommit: engine, policy, CLI, adapters
  claude-git-autocommit/       existing npm name; forwards installation to core
  opencode-git-autocommit/     existing npm name; OpenCode v2 plugin entry point
  codex-git-autocommit/        Codex hook installer wrapper
hooks/                        separate Claude and Codex native plugin hooks
.claude-plugin/               Claude plugin and marketplace
.codex-plugin/                Codex plugin manifest
.agents/plugins/              Codex local marketplace
test/                         integration tests using disposable Git repositories
```

The core and adapters have no third-party runtime dependencies. The OpenCode SDK
is a development dependency used to verify the adapter's actual v2 type contract.
Both OpenCode entry points export the v2 plugin object without an SDK import.

## Development

Requires Node.js 20+, npm with workspace support, and Git. POSIX shells are
required for the generated Claude/Codex hook commands; Windows users need WSL.

```sh
npm ci
npm run check
```

`npm run check` typechecks, builds, tests real Git behavior and hook adapters,
checks the actual OpenCode SDK contract, and installs all four npm tarballs in
an isolated temporary directory. Dependency lifecycle scripts are not required;
`npm ci --ignore-scripts` is also supported. Compiled `packages/core/dist/` is
included so Git-installed native plugins can run without a build step.

## Install from npm

Choose an agent and scope explicitly. Preview a standalone installation first:

```sh
npx coding-git-autocommit install codex --project --dry-run
npx coding-git-autocommit install codex --project
npx coding-git-autocommit install claude --user
npx coding-git-autocommit install opencode --project
```

The host-specific installer names remain available:

```sh
npx claude-git-autocommit --project --dry-run
npx codex-git-autocommit --project --dry-run
```

For OpenCode's npm plugin route, use `opencode-git-autocommit` in its plugin
configuration or run `opencode plugin add opencode-git-autocommit@latest` on
OpenCode v2. Use either this npm route or the standalone local-plugin installer.

## Installation from a checkout

Building the project does not activate any integration. Choose the agent and
scope explicitly. Preview first with `--dry-run`:

```sh
node packages/core/dist/bin.js install codex --project --dry-run
node packages/core/dist/bin.js install codex --project
node packages/core/dist/bin.js install claude --user
node packages/core/dist/bin.js install opencode --project
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

## Compatibility packages and migration

The workspace retains the existing `claude-git-autocommit` and
`opencode-git-autocommit` package names and adds `codex-git-autocommit`.
The Claude and Codex wrapper CLIs accept the familiar
`--user`, `--project`, and `--dry-run` options. OpenCode keeps its default and
named `GitAutocommitPlugin` exports and plugin id `git-autocommit`.

The wrapper releases pin their shared-engine dependency. All packages link to
this monorepo, while retaining their existing unscoped package names. See
[CHANGELOG.md](https://github.com/reachdevel/coding-git-autocommit/blob/main/CHANGELOG.md)
for the adapter major-version migration.

Before migrating, disable the old native plugin, standalone hook, or OpenCode
package entry. The new installer leaves external integrations alone by default.
For recognized old Claude standalone hook commands in the **same settings
file**, `--replace-legacy` removes those commands while retaining unrelated
hooks. It cannot disable a separately installed plugin or another scope.

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
node packages/core/dist/bin.js commit codex --cwd /path/to/project --staged --respect-hooks
```

## License

MIT. Original copyright is preserved; see [NOTICE](NOTICE) for provenance.

## Releases

`.github/workflows/publish.yml` publishes all four packages in dependency order
from GitHub-hosted runners with npm OIDC trusted publishing. There is no npm
publish token in the repository. The workflow runs the full verification suite
and checks that generated build artifacts match the commit before publishing.

For a release, update the engine version, its generated CLI version, adapter
dependency pins, and any changed adapter versions. Run `npm install
--package-lock-only --ignore-scripts`, then `npm run check`, and commit all
metadata and generated artifacts. Push a `v<engine-version>` tag to publish.
The workflow can also be rerun manually; already-published package versions are
skipped, allowing recovery after a partial release.

Each package's npm trusted-publisher configuration must authorize
`reachdevel/coding-git-autocommit`, workflow filename `publish.yml`, with direct
publishing allowed. New package names need a one-time authenticated bootstrap
publish before npm permits configuring that relationship.
