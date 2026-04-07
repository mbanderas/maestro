# CLAUDE.md — Maestro for Claude Code

<!-- Thin runtime adapter. Portable orchestration doctrine lives in
     AGENTS.md and is imported below. Only Claude Code-specific rules
     belong in this file. -->

@AGENTS.md

---

## Claude Code Runtime Rules

<!-- Capabilities: subagents, agent teams, hooks, CLAUDE.md imports,
     HTML comment stripping. Docs: code.claude.com/docs -->

### Execution Modes

- Default to subagents within a single session.
- Prefer subagents for narrow independent work with scoped context.
- Use agent teams only when peer-to-peer coordination is materially
  useful — long-running parallel workstreams with shared state.
- When spawning specialists, restrict tools to task scope. Claude Code
  allows tool restriction per subagent — use it.

### Enforcement

- Prefer hooks for structural enforcement (lint, format, policy checks)
  over repeated prompt-level reminders.
- Use `@path/to/file` imports to share instructions without duplication.
- Keep maintainer-only notes and rationale in HTML comments — they are
  stripped from model context, preserving human readability at zero
  token cost.

### Context Limits

<!-- These are Claude Code runtime constraints that override the generic
     guidance in AGENTS.md Section 7.2. -->

- File read budget: 2,000 lines per call.
- Tool results exceeding 50,000 chars are silently truncated.
- Auto-compaction destroys context after ~10 messages — re-read files
  before editing when this threshold is crossed.
- Max 3 edits per file without a full re-read.
