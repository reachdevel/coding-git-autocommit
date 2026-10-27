# Coding Git Autocommit

This repository combines the Claude Code and OpenCode implementations with a
Codex adapter in one standalone npm package: coding-git-autocommit. Keep all Git
behavior in src/; internal adapters translate events and host metadata. Do not
reintroduce wrapper packages, workspaces, or dependencies on predecessor projects.

- Derive commit messages only from the staged diff. No model calls or assistant-message parsing.
- Never commit from a hook on unsupported events, invalid configuration, planning mode, merge conflicts, or active merge/rebase operations.
- Hook failures return exit zero and diagnostics on stderr; stdout stays empty.
- Respect shared user/project policy. Preserve the documented OpenCode autoInit default through adapter defaults, not a second Git implementation.
- Use filesystem locking per worktree. Do not replace it with an in-memory queue or steal a lock from a possibly live process.
- Do not infer ownership of changes from filenames or session IDs.
- All tests that stage or commit must use disposable Git repositories.
- Run npm run check after behavioral changes. It includes real Git integration tests, an actual OpenCode SDK type contract, and isolated installation of only this package.
- Keep compiled dist/ in Git: native hook plugins have no npm build step.
- Plugin manifests and the generated CLI version match the root package version.
- Do not enable integrations, change personal agent settings, publish packages, or push releases as part of building/testing the repository.
