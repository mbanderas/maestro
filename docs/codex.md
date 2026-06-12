# Maestro on Codex

Codex reads `AGENTS.md` natively — no adapter file needed. This page
maps Maestro's concepts onto Codex specifics. All behavior below was
verified against the official Codex docs
([AGENTS.md guide](https://developers.openai.com/codex/guides/agents-md),
[Automations](https://developers.openai.com/codex/app/automations.md),
[Subagents](https://developers.openai.com/codex/subagents.md))
on 2026-06-12.

## AGENTS.md semantics

Codex discovers instruction files in this order:

1. **Global:** `~/.codex/AGENTS.override.md` if present, else
   `~/.codex/AGENTS.md`.
2. **Project:** walking from the Git root down to the current working
   directory, checking each level for `AGENTS.override.md`, then
   `AGENTS.md`.

Files are concatenated root-down with blank lines between them; files
closer to your current directory appear later in the combined prompt
and therefore override earlier guidance. Codex skips empty files,
discovers once per run, and stops adding files once the combined set
hits `project_doc_max_bytes` (32 KiB by default).

Practical consequences for Maestro:

- **Placement:** put Maestro's `AGENTS.md` at the repository root. If
  you already have a project `AGENTS.md`, append Maestro's content to
  it (Codex concatenates by directory level, not by file).
- **Budget:** Maestro's always-on kernel is ~8 KB — a quarter of the
  default 32 KiB cap, leaving room for your project instructions
  (the full S2-S6 protocol lives in `docs/orchestration.md`, read on
  demand). If you layer nested `AGENTS.md` files, watch the cap:
  Codex silently stops adding files beyond it.
- **Global install:** putting Maestro in `~/.codex/AGENTS.md` applies
  the doctrine to every project; per-repo files then layer on top and
  win where they conflict.

## Multi-agent routing (S2-S6 mapping)

Codex supports subagent workflows in the CLI and app, but current Codex
docs specify that subagents spawn only when the user explicitly asks for
them. Practical mapping for Maestro:

- If the user did **not** explicitly ask for subagents, parallel
  agents, or delegation, emit the counted S1 verdict and continue
  single-agent even when the portable gate would otherwise route to
  S2-S6.
- If the user explicitly asked for subagents/parallel work and the S1
  gate returns multi-agent, map Maestro's Planner, Specialists, and
  Staff Engineer to Codex subagents. Keep specialist prompts scoped and
  cap parallel groups at 4 as usual.
- Claude Code agent teams do not transfer to Codex. Codex subagents are
  the only Codex-native mapping for Maestro specialists.

## Long-horizon operation (S10 mapping)

Claude Code maps S10 to `/loop`, `/schedule`, and `ScheduleWakeup`.
The Codex analog is **Automations** (Codex app, automations pane):
recurring prompts that run in the background on minute-based, daily,
weekly, or cron schedules.

| Maestro S10 concept | Codex mechanism |
|---|---|
| Self-paced session loop | **Thread automations** — heartbeat-style recurring wake-up calls attached to the current thread, preserving conversation context |
| Durable scheduled routine | **Standalone/project automations** — independent runs; findings land in the Triage inbox (auto-archived when there is nothing to report) |
| Checkpoint artifact | Same convention: one `_<task>.md` in the repo root (gitignore `_*`), read first on every run, holding phase status, findings with sources, decisions with rationale |
| Scripted/CI iteration | `codex exec "<prompt>"` non-interactive runs |

S10 rules apply unchanged: hard caps on iterations, completion criteria
declared up front, externalized state (the thread is not durable
memory), and an explicit final report instead of a zombie loop. For
project-scoped automations note the Codex requirement that the local
app is running and the project is on disk.

## What does not transfer

Codex has no user-hook system equivalent to Claude Code's, so Maestro's
structural enforcement pack (subagent guard, loop guard, phase-scope
guard, gate telemetry) does not run on Codex. The prose doctrine in
`AGENTS.md` is the enforcement surface; S7.3's verification gate relies
on the model honoring it rather than on a hook.

The Maestro context bar also does not apply: Codex CLI ships a native
context-usage indicator (`/statusline` picker, or `context` in
`[tui].status_line` in `~/.codex/config.toml`).
