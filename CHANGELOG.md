# Changelog

All notable changes to Maestro are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow
[Semantic Versioning](https://semver.org/).

## [Unreleased]

## [1.3.1] - 2026-06-15

### Fixed

- **`docs/orchestration.md` em-dash-scrub damage**: the Model Routing
  output-cap table carried broken `|, |` cells for Haiku, Opus, and
  Frontier — the em-dash "no exception" marker had been scrubbed to a
  bare comma — now ASCII `-`. The H1 and the "Model Routing" H2, whose
  em-dash separators the same scrub turned into commas, are now colons
  (matching the scrub's own H1-to-colon convention). The deliberate
  prose commas are unchanged.

### Changed

- **CHANGELOG reconciliation**: added the missing [1.2.0] and [1.3.0]
  entries so the changelog matches the shipped tags and GitHub releases,
  and graduated the former [Unreleased] "S10 loop-design rules" into
  [1.2.0] — the version whose history first shipped them (`e64b4d3`, an
  ancestor of the 1.2.0 bump `408b293`).

## [1.3.0] - 2026-06-15

### Added

- **`/maestro:settings` polish** (`commands/settings.md`): direct
  slash-command arguments and inline help over the unified settings CLI.
- **Context-bar status line** (`commands/context-bar.md`): a Frontier
  engine badge and a bare terse level in the status line, plus compact
  M-token formatting (1M, 1.4M).
- **Frontier auto-run** (`commands/frontier.md`): runs the engine on
  every prompt when armed.

## [1.2.0] - 2026-06-14

### Added

- **Frontier engine** (`commands/frontier.md`): an opt-in,
  zero-dependency local multi-CLI engine. Fan a prompt out to the model
  CLIs on your machine, judge the answers into a structured analysis,
  then write a grounded synthesis. `off`/`single`/`fusion` modes switch
  via `/maestro:frontier`; adds a `gpt-duo` preset and configurable
  judge/synth roles. Frontier-led README and branding, a frontier-stack
  positioning diagram, and a unified SVG motion language.
- **Unified settings** (`commands/settings.md`, `docs/settings.md`): the
  `/maestro:settings` command plus a portable status/set CLI aggregating
  the terse, frontier, and context-bar stores; docs page, README entry,
  and a picker covering the full frontier matrix.
- **S10 loop-design rules** (`AGENTS.md`): three additions derived
  from Anthropic's Fable 5 loop-design guidance (RLanceMartin,
  2026-06). Loop termination is graded by a verifier subagent in a
  fresh context against checkable criteria, never self-assessed by
  the loop that did the work. Checkpoint findings graduate failure
  note -> investigated cause -> verified fact -> distilled rule,
  with distilled rules consulted before re-deriving. Hillclimbing
  loops bet on structural changes over scalar tuning; transient
  regressions inside the iteration cap are data, not stop signals.

### Changed

- **Em-dash scrub** (`docs/orchestration.md`, `docs/benchmarks.md`,
  `docs/context-bar.md`, `docs/codex.md`, `docs/hooks.md`,
  `commands/frontier.md`): replaced prose em-dashes with commas (code,
  links, and anchors skipped) for a consistent ASCII house style; the
  benchmarks H1 became a colon.
- **Windows portability**: transcript parsing and flag I/O fixes,
  compress run through the shell with CRLF tolerance, statusline rounding
  aligned between `context-bar.ps1` and `context-bar.sh`, and a
  `windows-latest` CI matrix leg.

## [1.1.0] - 2026-06-12

### Added

- **Terse mode** (`hooks/maestro-terse-mode.cjs`,
  `skills/terse/SKILL.md`, `commands/terse.md`): token-efficient
  output levels lite/full/ultra, adapted from the MIT-licensed
  [Caveman](https://github.com/JuliusBrussee/caveman) plugin. Off by
  default; enable per session with `/maestro:terse` or permanently
  via `terseLevel` in `~/.config/maestro/config.json`. SessionStart
  injects the level-filtered ruleset; a per-turn one-line reminder
  defeats style drift. Flag I/O is symlink-refusing, atomic, 0600,
  size-capped, whitelisted. Statusline shows a `[TERSE:<LEVEL>]`
  badge with the same hardening.
- **`/maestro:compress`** (`scripts/compress.cjs`,
  `commands/compress.md`): compresses natural-language memory files
  to cut input tokens (S8), ported from Caveman's Python pipeline to
  zero-dependency Node + `claude --print`. Deterministic validation
  (headings, byte-exact code blocks, URLs), `.original.md` backup
  with abort-if-exists, restore-on-failure, and a hard sensitive-path
  refusal (.env/credentials/keys/`.ssh`/`.aws`) before anything
  crosses the API boundary.
- **CI + npm scripts** (`package.json`, `.github/workflows/ci.yml`,
  `scripts/run-hook-tests.cjs`, `scripts/bench-verify.cjs`): hook
  test sweep, bash -n, JSON parse, markdownlint, and static fixture
  checks on every push/PR. Still zero npm dependencies.

### Changed

- **SubagentStop guard contract fix**
  (`hooks/maestro-subagent-guard.cjs`): warnings now use the
  documented `decision:block` channel — `additionalContext` is not
  honored on SubagentStop, so S7.3 warnings were silently dropped.
  Blocks exactly once per agent (marker-file guard unchanged).
- **Gate telemetry verdict tracking**
  (`hooks/maestro-gate-telemetry.cjs`): rows now record `verdict`
  (parsed `GATE:` line), `agent_count`, and `mismatch`, surfacing the
  measured "multi verdict stated, nothing spawned" failure mode that
  spawn-count inference recorded as single-agent.
- **Bash mutation detection** (`hooks/maestro-subagent-guard.cjs`,
  `hooks/maestro-phase-scope.cjs`): shell writers (redirects,
  `sed -i`, `tee`/`mv`/`cp`/`rm`/`mkdir`/`touch`, `git commit/apply`,
  package installs) now trigger the S7.3 verify warning and count
  toward the S7.1 file cap. Patterns run against parsed Bash command
  strings only — arrows in prose cannot flag a research agent.
- **Specialist manifest schema**
  (`schemas/specialist-manifest.schema.json`): `role` description
  rewritten to the mandated procedural form (was teaching the
  identity-label anti-pattern); optional `toolBudget` cap added.
- **README claims**: "0 voids" corrected to the honest count (11
  voids excluded & re-run per the void rule); "zero-dependency
  runner" scoped to "no npm/package deps; macOS/Linux script needs
  jq".

- **S7.3 overclaim fix** (`AGENTS.md`, `.cursorrules`): one added
  line — no checker ran means the status token is UNVERIFIED, never
  VERIFIED; grep or read evidence does not upgrade it. Targets the
  kernel-branch regression where t08 reported VERIFIED without any
  checker run in 5 of 6 benchmark runs. Measured effect
  (`benchmarks/results/20260611-summary-hooks.md`): unsupported
  VERIFIED 5/6 -> 0/6; doctrine re-reads 24/24 denied across 18
  hooked runs with oracle pass unchanged; cost null vs baseline.
  Same summary corrects the efficiency report's "+24% fatter final
  messages" attribution (real driver: thinking + sidechain billing;
  erratum added in place) and documents the README run-count and
  hook-count refresh.

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

- **Doctrine-read guard hook** (`hooks/maestro-doctrine-guard.cjs`):
  PreToolUse hook that denies a `Read` of `AGENTS.md`/`CLAUDE.md` when
  the doctrine is autoloaded (doctrine file present at cwd), replacing
  the probabilistic S7.2 "never re-read" prose with deterministic
  zero-token enforcement. Default mode denies with an instructive
  reason; `MAESTRO_DOCTRINE_GUARD=once` allows the first read per
  session for runtimes whose subagents lack the doctrine in context;
  `=0` disables. `docs/orchestration.md` is never guarded. Wired into
  `hooks/hooks.json`.
- **Benchmark runner `-InstallHooks` flag**
  (`benchmarks/run-maestro-bench.ps1`): opt-in staging of the shipped
  hook pack into a second isolated `CLAUDE_CONFIG_DIR`, used only for
  doctrine-bearing (on/core) runs. Default OFF keeps every baseline
  cell hook-free and comparable; off-mode cells never get hooks.
  Result rows carry a `hooks` boolean.
- **Gate reminder hook** (`hooks/maestro-gate-reminder.cjs` +
  `hooks.json` UserPromptSubmit wiring, tests alongside): injects the
  S1 counted-verdict checklist as additional context on the first
  prompt of a session, fire-once per session, opt-out via
  `MAESTRO_GATE_REMINDER=0`. Context injection only — a reminder
  cannot force a verdict or a spawn.
- **Benchmark runner `-Hooks` subset selector**
  (`benchmarks/run-maestro-bench.ps1`): with `-InstallHooks`, stages
  only the named hooks (short names, e.g. `-Hooks gate-reminder`) —
  filters both the staged `.cjs` copies and the `hooks.json` wiring
  written into the isolated `settings.json`; default stays the whole
  pack. Result rows carry `hook_set`. Built to attribute pack effects
  to single hooks; first measurement
  (`benchmarks/results/20260611-summary-spawns.md`): `gate-reminder`
  alone reproduces the full pack's t12 spawn increase (multi-agent
  verdict + specialist spawn in 6/6 runs vs 1/6 unhooked), oracle
  pass unchanged 6/6, cost gap inside spread (null); a no-guard
  control saw all 12 doctrine re-read attempts succeed, confirming
  the guard caused the hook cells' 0 successful re-reads.

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
