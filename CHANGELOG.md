# Changelog

All notable changes to Maestro are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Changed

- **Decision Gate made actionable** (`AGENTS.md` S1/S2): the gate now
  requires a one-line verdict (`GATE: single-agent — <reason>` or
  `GATE: multi-agent — <trigger met>`) before the first file edit, and
  a multi-agent verdict must immediately spawn the Planner via the
  Task/Agent tool — a verdict without the spawn is a gate violation.
  S2 names the Planner as a real subagent created by a tool call, not
  an inline step. Motivation: zero S2-S6 spawns and zero gate
  verbalization across all 33 measured ON runs/sessions to date; the
  gate was descriptive prose with no action binding and no output
  obligation. Single-agent default for sub-trigger tasks unchanged.

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
