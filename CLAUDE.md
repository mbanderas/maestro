# CLAUDE.md — Maestro for Claude Code

<!-- Thin runtime adapter. Portable doctrine lives in AGENTS.md. Only
     Claude Code-specific rules belong here. Capabilities: subagents,
     agent teams, hooks, @imports, HTML-comment stripping.
     Docs: code.claude.com/docs -->

@AGENTS.md

---

## Claude Code Runtime Rules

### Execution
- Default: subagents in single session. Scope tools per subagent.
- Agent teams only for peer-to-peer coordination over long-running
  parallel workstreams with shared state.

### Worktree Isolation (parallel writers)
- 2+ specialists in one group modifying files: pass
  `isolation: "worktree"` per Agent call. Prevents cross-talk
  file-state corruption; auto-cleans if the agent makes no changes;
  otherwise returns branch+path for the orchestrator to merge.
- Skip (in-place default) for read-only specialists, a single writer
  in the group, or mutually exclusive file sets (<=3 files each).

### Enforcement
- Hooks > prompt reminders for structural checks (lint, format, policy,
  verification gates, SubagentStop guards).
- `@path/to/file` imports for shared instructions; no duplication.
- HTML comments for maintainer notes (stripped from model context).

### Context Limits (override AGENTS.md S7.2 generic guidance)
- Read: 2,000 lines/call. Results >50,000 chars silently truncated.
- Compaction destroys context after ~10 messages — re-read before edit.
- Max 3 edits per file without full re-read.
- Read tool "PARTIAL view" notice = chunk-trigger; re-issue with
  offset/limit.

### Long-Horizon Operation (S10 mapping)
- Fixed cadence: `/loop <interval>` (session cron, auto-expires ~7
  days) or `/schedule` for durable cloud routines. No interval:
  self-paced via ScheduleWakeup (60-3600s clamp).
- Wakeup pacing: prompt cache TTL ~5 min. Actively polling external
  state: <=270s. Otherwise 1200s+. Never schedule wakeups to poll
  harness-tracked background work — completion notifies on its own.
- Event-gated waits: arm a persistent Monitor as the primary wake
  signal; ScheduleWakeup is the fallback heartbeat.
- Checkpoint artifact: `_<task>.md` in repo root (gitignore `_*`);
  read first on every wakeup.
- Workflow tool: deterministic multi-agent fan-out (pipeline/parallel,
  schema-validated outputs) — explicit user opt-in only; S9 routing
  and output caps apply per agent.
