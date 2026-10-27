# Changelog

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
