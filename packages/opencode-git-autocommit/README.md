# opencode-git-autocommit

Thin host adapter for the shared `coding-git-autocommit` engine.

OpenCode v2 plugin. Retains the `git-autocommit` plugin id and default/named exports.
Configure this package in OpenCode or use the umbrella CLI local installer.

The shared policy is `.coding-git-autocommit.json` at the repository root.
Defaults preserve checkpoint behavior: stage all changes and pass `--no-verify`.
Set `staging` to `staged` and `skipHooks` to `false` to change these choices.
See the workspace README and the `coding-git-autocommit` package README for configuration, migration, and limitations.

Requires Node.js 20+. MIT license. Installation is explicit; developing this repository does not activate the adapter.

Source and full documentation: https://github.com/reachdevel/coding-git-autocommit
