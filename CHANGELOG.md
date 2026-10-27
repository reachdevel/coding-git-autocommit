# Changelog

## 0.2.0

- Make coding-git-autocommit the sole standalone package, with the shared engine,
  CLI, and Claude Code, OpenCode, and Codex adapters in src/ and dist/.
- Remove all three compatibility packages and npm workspaces.
- Export the bundled OpenCode v2 plugin directly from coding-git-autocommit and
  coding-git-autocommit/opencode; the root also retains named engine exports.
- Publish only coding-git-autocommit from the trusted GitHub workflow.
- Document migration from the deprecated predecessor package names.
- Verify all three integrations from a single installed tarball with no runtime
  dependencies or predecessor packages present.

## 0.1.1

- Consolidate Claude Code and OpenCode Git behavior in one model-free engine.
- Add Codex Stop-hook support, standalone installers, and native plugin manifests.
- Add shared policy, staged-only mode, configurable hook bypass, cross-process
  locking, worktree support, and durable-event deduplication.
- Preserve the original diff-derived Conventional Commit subjects.
- Publish the Claude adapter as `claude-git-autocommit@2.0.0`, the OpenCode
  adapter as `opencode-git-autocommit@4.0.0`, and the Codex adapter as
  `codex-git-autocommit@0.1.1`.
- Connect npm trusted publishing to `reachdevel/coding-git-autocommit`.

The Claude and OpenCode adapter major versions require Node.js 20 or newer.
Disable previous hooks/plugins before switching installation methods. See the
README for behavior defaults, migration, and project configuration.

## 0.1.0

Initial shared-engine and Codex package bootstrap for npm trusted publishing.
