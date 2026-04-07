# GEMINI.md — Maestro for Gemini

@./AGENTS.md

---

## Gemini Runtime Notes

### Precedence

This file takes precedence over `AGENTS.md` when both are present.
Portable orchestration doctrine is imported above — only
Gemini-specific behavior belongs here.

### Execution Mapping

- **Single-agent mode** — standard Gemini execution, no overhead.
- **Multi-agent mode** — use Gemini sub-agents for independent parallel
  work when the Decision Gate (Section 1) qualifies the task.
- Do not assume Claude Code features (hooks, agent teams, per-subagent
  tool restriction) are available. Use only verified Gemini capabilities.

### Instruction Organization

- Use `@./path/to/file.md` imports to share instructions without
  duplication.
- Keep runtime-specific rules in this file; portable rules in
  `AGENTS.md`.

### Verification

When Section 7.3 requires type-checking or linting, use the project's
configured tooling. Do not assume specific CLI tools — check project
configuration first.
