# CLAUDE.md — Maestro for Claude Code

<!-- Thin runtime adapter. Portable doctrine lives in AGENTS.md.
     Already have your own CLAUDE.md? Add the single @AGENTS.md line
     to it — that is the whole install. -->

@AGENTS.md

---

## Claude Code Runtime Rules

- Subagents in single session by default; scope tools per subagent.
  Agent teams only for long-running parallel workstreams with shared
  state.
- Worktree isolation: 2+ specialists in one group modifying files —
  pass `isolation: "worktree"` per Agent call. Skip for read-only
  specialists, a single writer, or disjoint <=3-file scopes.
- Hooks > prompt reminders for structural checks; the shipped pack
  (gate-reminder, subagent-guard, loop-guard, phase-scope,
  gate-telemetry, doctrine-guard) lives in `hooks/`.
- Read tool: 2,000 lines/call; results >50,000 chars truncate
  silently; a "PARTIAL view" notice means re-issue with offset/limit.
- S10 mapping: `/loop <interval>` or `/schedule` (durable cloud);
  no interval = self-paced ScheduleWakeup (polling <=270s, otherwise
  1200s+; never poll harness-tracked work — completion notifies).
  Event waits: persistent Monitor primary, wakeup as fallback
  heartbeat. Checkpoint: `_<task>.md` in repo root (gitignore `_*`).
  Workflow tool only on explicit user opt-in; S9 caps apply.
