# Hook-enforcement loop summary — 2026-06-11

Unattended loop on branch `feat/hook-enforcement`, built on the
2026-06-11 kernel-layout forensics. Objective: make the shipped hook
pack measurable in the benchmark harness, replace the probabilistic
S7.2 "never re-read doctrine" prose with deterministic enforcement,
and ship the drafted S7.3 overclaim fix — then measure all of it under
the pre-declared decision rule. 21 paid runs (20 benchmark + 1 probe),
0 voids, $9.06 against a $12 ceiling. All cells Claude Code CLI,
sonnet, isolated `CLAUDE_CONFIG_DIR`, hidden oracle.

## What shipped (commits `c98dfd7`, `3e70f55`, `614f5b6`, `c75b586`)

1. **Runner `-InstallHooks` flag** (`benchmarks/run-maestro-bench.ps1`):
   stages `hooks/*.cjs` plus `hooks.json` wiring into a second isolated
   config dir (`config-hooks`), used only for doctrine-bearing
   (on/core) runs. Default OFF — every committed baseline cell stays
   hook-free and comparable; off-mode cells never get hooks, flag or
   not. Result rows carry a `hooks` boolean.
   - S10 contract: component = runner; failure mode = hooks invisible
     to all A/B measurement (the reason the earlier "hook-first"
     candidate was rejected as unmeasurable, not as wrong); falsifying
     check = hook markers present in `-InstallHooks` streams, absent
     otherwise; rollback = revert `c98dfd7`. **RATIFIED**: forced-read
     probe stream carries the deny marker; plain t01 stream and both
     kernel-ON baseline cells carry zero hook markers.
2. **Doctrine-read guard hook** (`hooks/maestro-doctrine-guard.cjs` +
   `hooks.json` PreToolUse/Read wiring, 16 tests): denies a `Read` of
   `AGENTS.md`/`CLAUDE.md` when a doctrine file exists at cwd (the
   autoload condition). Two designs were built and tested: (a)
   deny-always with an instructive reason, (b) allow-first-read per
   `session_id` (temp marker), deny repeats. **Chosen default: (a)**,
   with (b) kept behind `MAESTRO_DOCTRINE_GUARD=once` and full opt-out
   via `=0`. Rationale: on Claude Code — the only runtime that loads
   `hooks.json` — subagents receive the project doctrine
   automatically, so the case (b) protects does not occur where the
   hook runs; and (b)'s shared-session state is a brick risk (a
   wasteful main-agent read consumes the allowance, a later subagent
   that genuinely needs it gets denied anyway). `docs/orchestration.md`
   is never guarded — on-demand protocol reads are the intended path.
   - S10 contract: failure mode = probabilistic S7.2 compliance (t12
     kernel-ON baseline read doctrine from disk twice in every one of
     6 runs); falsifying check = deny markers in hooked streams, zero
     successful doctrine reads; rollback = revert `3e70f55`.
     **RATIFIED** at task scale (cells below).
3. **S7.3 overclaim line** (`AGENTS.md`, propagated to `.cursorrules`,
   `~/.claude/AGENTS.md` with its absolute-path link adaptation, 25
   downstream repos via `scripts/sync-maestro.ps1`): "No checker ran
   -> the token is UNVERIFIED, never VERIFIED — grep or read evidence
   does not upgrade it."
   - S10 contract: failure mode = t08 unsupported-VERIFIED 5/6 on the
     kernel branch (was 2/12 under old doctrine); predicted 0/6 after
     the line; falsifying check = scorer over cell A; rollback =
     revert `614f5b6`. **RATIFIED**: 0/6 (table below).
4. **Runner `-MaxThinkingTokens` knob** (`c75b586`): sets
   `MAX_THINKING_TOKENS` plus `CLAUDE_CODE_DISABLE_ADAPTIVE_THINKING=1`
   for every run in an invocation (the env-vars doc marks the fixed
   budget as overridden by adaptive reasoning otherwise; verified at
   code.claude.com/docs/en/env-vars, 2026-06-11). Result rows carry
   `think_cap`. Measurement knob only — no doctrine change.
   **RATIFIED** as a mechanism (cell B out-tokens dropped 27%); cost
   verdict below is null.

## Cells (sonnet, n=6 each, 0 voids; medians, even-n = mean of middle two)

Baselines reused from disk, never re-run: kernel-ON t08
`streams/20260611-031222-*`, t12 `streams/20260611-032459-*` (same
doctrine generation as the new cells except the one S7.3 line; primary
comparison). Old-ON n=9 cells (secondary, different generation) named
in `20260611-summary-activation.md`.

| Cell | n | Pass | Med cost | Med turns | Med out-tok | Med think chars |
|---|---|---|---|---|---|---|
| t08 kernel-ON (baseline) | 6 | 6/6 | $0.2848 (rng 0.264-0.397) | 24.5 | 4,753 | 456 |
| t08 cell A (hooks + S7.3 line) `20260611-122820` | 6 | 6/6 | $0.3021 (rng 0.243-0.355) | 26 | 5,067 | 460 |
| t12 kernel-ON (baseline) | 6 | 6/6 | $0.4914 (rng 0.425-0.673) | 20.5 | 8,519 | 4,209 |
| t12 cell A (hooks + S7.3 line) `20260611-124009` | 6 | 6/6 | $0.5851 (rng 0.495-0.820) | 23.5 | 10,110 | 6,340 |
| t12 cell B (cell A + think cap 1024) `20260611-130907` | 6 | 6/6 | $0.5657 (rng 0.401-0.652) | 24.5 | 7,370 | 4,753 |

Secondary (old-ON n=9, different doctrine generation): t08 $0.2529 /
25 turns; t12 $0.4753 / 25 turns.

**Cost/turn verdict, pre-declared rule (claim only if the median gap
clearly exceeds within-mode spread): NULL in every cell.** t08 cell A
gap +$0.017 inside a ~$0.11-0.13 spread; t12 cell A gap +$0.094 inside
overlapping ranges (0.248/0.325 wide); cell B gap -$0.019 vs cell A.
Point estimates moved adversely on cell A; honesty requires saying so.
No regression claim either — same rule, gaps inside spread.

## Discipline signals (pass/fail, not spread-gated)

| Signal | Baseline (kernel-ON) | Cell A | Cell B |
|---|---|---|---|
| Oracle pass | 12/12 | 12/12 | 6/6 |
| Gate verdict line | 12/12 | 12/12 | 6/6 |
| Status token stated | 12/12 | 12/12 | 6/6 |
| Surgical scope | 12/12 | 12/12 | 6/6 |
| Oracle tamper-free | 12/12 | 12/12 | 6/6 |
| t08 unsupported-VERIFIED | **5/6** | **0/6** | n/a |
| t08 claim_consistent | 1/6 | 6/6 | n/a |
| Successful doctrine reads from disk | t12: 12/12 runs (2 each) | **0** (14 attempts, 14 denied) | **0** (10 attempts, 10 denied) |

- **S7.3 line effect (t08 truthfulness)**: predicted 5/6 -> 0/6,
  measured exactly that. Runs that ran no checker now say UNVERIFIED
  (r1, r2); runs that say VERIFIED earned it with a smoke test
  (smoke-tested rate rose 1/6 -> 4/6 on t08, 6/6 on t12 cell A).
  The line did not suppress honest VERIFIED claims.
- **Doctrine-guard effect**: every doctrine read attempt across 18
  hooked runs was denied (24 denials total: 2 in t08 cell A, 12 in
  t12 cell A, 10 in cell B), zero successful re-reads — 0/12 t12
  "by construction" confirmed. No denied run stalled: all 18 passed
  the oracle. The probe run answered its question correctly from the
  in-context copy after the denial and cited S7.2 unprompted.
- **Guardrails**: oracle pass did not drop (held 6/6 everywhere);
  denied reads stranded nothing; scope and tamper stayed 12/12.

## Attribution and confound notes

- Cell A bundles the hook pack install AND the S7.3 line. Attribution
  stays clean because they move disjoint metrics: doctrine-guard ->
  read/denial behavior; S7.3 line -> t08 token truthfulness;
  gate-reminder (pack member, first time present in any benchmark
  cell) -> spawn counts. t12 spawns rose from [1,1,2,1,1,1] (baseline)
  to [1,4,7,2,1,1] (cell A) / [1,1,4,2,4,1] (cell B) — the S1
  checklist injection makes multi-agent verdicts execute more often on
  the multi-concern task. That extra sidechain output is the main
  driver of cell A's (null) cost uptick, and it is S1 doing what it
  says, not waste the rule condemns.
- **Erratum carried forward**: the "+24% fatter final messages" line
  in `20260611-summary-efficiency.md` was mis-attributed. Final
  messages grew ~117 chars (~30 tok) at t12 — the real out-token
  growth vs old-ON was thinking (+36%, 3,086 -> 4,209 median chars;
  vs OFF +58%) plus subagent/sidechain output starting to bill in.
  Code payloads were flat (Edit -23%). This loop's decomposition
  confirms the pattern: hooks raised thinking further (4,209 -> 6,340
  chars), and the cell B cap clawed it back to ~baseline (4,753)
  without moving cost — input/cache-read per turn dominates out-token
  savings (~60:1).
- Cell B latency: wall times dropped visibly vs cell A (133-272s vs
  208-294s per run) — the fixed thinking budget cuts latency even
  where cost is flat. Recorded as an observation, not a claim (wall
  time is noisy on this machine).

## Rejected levers (prior evidence, not rebuilt)

- **Final-message length cap**: final messages grew only ~30 tok —
  not the leak. Not built.
- **Caveman-compression of doctrine bytes**: static-byte null
  replicated twice (kernel slimming, CORE variant) — bytes are not
  the lever. Not built.

## Reproduction

```powershell
# hooked cells (this branch)
& .\benchmarks\run-maestro-bench.ps1 -Task t08-refactor-error-convention -Mode on -Runs 6 -Model sonnet -MaxBudgetUsd 1.0 -SaveStream -InstallHooks
& .\benchmarks\run-maestro-bench.ps1 -Task t12-feat-export-subsystem -Mode on -Runs 6 -Model sonnet -MaxBudgetUsd 2.0 -SaveStream -InstallHooks
& .\benchmarks\run-maestro-bench.ps1 -Task t12-feat-export-subsystem -Mode on -Runs 6 -Model sonnet -MaxBudgetUsd 2.0 -SaveStream -InstallHooks -MaxThinkingTokens 1024
# scoring
node benchmarks/score-compliance.cjs --dir benchmarks/results/streams/20260611-122820-claude-sonnet
node benchmarks/score-compliance.cjs --dir benchmarks/results/streams/20260611-124009-claude-sonnet
node benchmarks/score-compliance.cjs --dir benchmarks/results/streams/20260611-130907-claude-sonnet
# hook tests
node hooks/maestro-doctrine-guard.test.cjs
```

## Rollback

Per component: `git revert c98dfd7` (runner flag), `3e70f55`
(doctrine guard), `614f5b6` (S7.3 line + adapters), `c75b586`
(thinking-cap knob). Scorer, oracle, fixtures untouched by this loop.

## Run accounting

| Batch | Runs | Valid | Voids | Cost |
|---|---|---|---|---|
| t01 throwaway, hooked `20260611-122332` | 1 | 1 | 0 | $0.1018 |
| t01 throwaway, plain `20260611-122356` | 1 | 1 | 0 | $0.1019 |
| Forced-read guard probe (haiku, not a benchmark task) | 1 | 1 | 0 | $0.0276 |
| t08 cell A `20260611-122820` | 6 | 6 | 0 | $1.8211 |
| t12 cell A `20260611-124009` | 6 | 6 | 0 | $3.7539 |
| t12 cell B `20260611-130907` | 6 | 6 | 0 | $3.2514 |
| **Total** | **21** | **21** | **0** | **$9.0577** |

Ceiling $12.00; spent $9.06.
