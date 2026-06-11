# Changelog

All notable changes to Maestro are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Changed

- **Always-on doctrine slimmed to a kernel** (`AGENTS.md`,
  `CLAUDE.md`, new `docs/orchestration.md`): the always-loaded
  surface drops ~41% (16,342 -> 9,596 bytes combined). The five
  discipline signals keep their wording and section numbers: S1
  counted gate verdict + spawn imperative, S7.3 status vocabulary
  and FORBIDDEN verification gate, S7.4 surgical scope, oracle
  integrity, S10 long-horizon rules. The full S2-S6 multi-agent
  protocol (Planner, Specialists, Cross-Talk, Staff Engineer,
  Orchestrator Discipline, full routing table) relocates verbatim to
  `docs/orchestration.md`, read on a multi-agent gate verdict; a
  compact inline S2-S6 protocol stays in the kernel so the verdict
  remains actionable on every runtime. New turn-tax rules from t12
  stream forensics (ON runs spent +3 turns re-reading doctrine
  already in context and +2 on trailing ceremony): never Read
  AGENTS.md/CLAUDE.md from disk when already in context, status
  token opens the final message (no separate wrap-up turn),
  orientation starts from target files. The blanket post-edit
  re-read mandate is dropped (zero behavioral delta at t12 n=9);
  conditional staleness re-reads (10+ messages, 3 edits per file)
  stay. `.cursorrules` is regenerated from the kernel, fixing drift
  (it predated the counted gate verdict).
- **Migration note** for users who appended an older `AGENTS.md`
  into their own instruction files: re-sync against the new kernel —
  S2-S6 detail now lives in `docs/orchestration.md`, and stale
  copies keep the pre-revision-3 gate rules. Diff the dated change
  in this repo's history (`git log --follow AGENTS.md`).

- **Decision Gate made actionable** (`AGENTS.md` S1/S2): the gate now
  requires a one-line verdict (`GATE: single-agent — <reason>` or
  `GATE: multi-agent — <trigger met>`) before the first file edit, and
  a multi-agent verdict must immediately spawn the Planner via the
  Task/Agent tool — a verdict without the spawn is a gate violation.
  S2 names the Planner as a real subagent created by a tool call, not
  an inline step. Motivation: zero S2-S6 spawns and zero gate
  verbalization across all 21 scanned runs/sessions to date (18
  headless t12 + 3 interactive-proxy); the gate was descriptive prose
  with no action binding and no output obligation. Single-agent
  default for sub-trigger tasks unchanged.
- **Decision Gate verdict is counted, triggers checked first**
  (`AGENTS.md` S1, revision 2): the verdict line now carries explicit
  counts (`GATE: files=<n> concerns=<m> -> ...`), files>=5 across 2+
  concerns is multi-agent by count ("no parallel benefit" cannot
  override a met trigger — only the shared-file/single-chain
  Constraints can), and Multi-Agent Mode is evaluated before the
  single-agent fallback. Motivation: revision 1 produced verdict
  lines in 3/3 probe runs (first gate verbalization ever measured)
  but all three misclassified a 7-file, 3-concern task as
  single-agent by citing "no parallelism needed" while never
  evaluating the file-count trigger.

- **Gate downgrade set closed** (`AGENTS.md` S1, revision 3): a met
  multi-agent trigger now downgrades only on >60% file overlap between
  subtasks or <=3 files total in one dependency chain — pattern
  homogeneity, "simple work", and create-then-wire sequencing are
  explicitly not downgrades, and the homogeneity constraint is scoped
  to the Planner's split design. Motivation: revision 2 produced
  correctly counted verdicts (files=6-7, concerns=3-4, trigger met)
  that still concluded single-agent by stretching the homogeneity and
  single-chain constraints into gate escapes.

### Added

- **Gate reminder hook** (`hooks/maestro-gate-reminder.cjs` +
  `hooks.json` UserPromptSubmit wiring, tests alongside): injects the
  S1 counted-verdict checklist as additional context on the first
  prompt of a session, fire-once per session, opt-out via
  `MAESTRO_GATE_REMINDER=0`. Context injection only — a reminder
  cannot force a verdict or a spawn.

## [1.0.0] - 2026-06-10

First tagged release. Everything below was built incrementally on `main`
(commit refs in parentheses); 1.0.0 freezes it as the installable baseline.

### Added

- **Orchestration doctrine** `AGENTS.md` S0-S10: Quality Standard,
  Decision Gate with research-backed 4-specialist cap, Planner,
  Specialists, Cross-Talk, Staff Engineer review, Universal Rules,
  Compression, Model Routing, Long-Horizon Operation (`39d6f03` ...
  `1ca4450`).
- **Runtime adapters**: `CLAUDE.md` (Claude Code, incl. S10 long-horizon
  mapping), `GEMINI.md`, `.cursorrules` self-contained copy, plain
  `AGENTS.md` for Codex (`047ba19`, `a54ac63`, `70296b4`).
- **Hook pack** (zero-dependency `.cjs`, soft warnings, fire-once,
  tests alongside): `maestro-subagent-guard` (S7.3 verification,
  SubagentStop), `maestro-loop-guard` (S10 checkpoints + iteration cap,
  Stop), `maestro-phase-scope` (S7.1 max files per phase, PostToolUse),
  `maestro-gate-telemetry` (opt-in local gate stats, SessionEnd)
  (`9f99d5c`, `792ff2e`, `d6b7ad1`, `b0ab394`).
- **Context bar** status line for Claude Code (PowerShell + bash) with
  `/context-bar` toggle command (`f095358`).
- **Benchmark harness** `benchmarks/`: six fixture tasks with
  deterministic verifiers, isolated-config A/B runner (Maestro ON/OFF),
  protocol with n>=3 rule, first measured exploratory results
  (`367d009`, `a6b80ec`).
- **Plugin packaging**: `.claude-plugin/plugin.json` +
  self-hosted marketplace + auto-wired `hooks/hooks.json`, installable
  via `/plugin marketplace add mbanderas/maestro`.
- Downstream sync script `scripts/sync-maestro.ps1` (`f0883c2`).
