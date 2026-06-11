# Spawn-isolation loop summary — 2026-06-11

Unattended loop on branch `feat/spawn-isolation`, built directly on
the same-day hook-enforcement loop
([`20260611-summary-hooks.md`](20260611-summary-hooks.md)). Objective:
attribute cell A's t12 spawn increase to a single hook, measure
whether the extra spawning buys quality or only cost, quantify the
verdict-spawn gap across every cell on disk, and settle the
thinking-cap latency question under a pre-declared spread rule.
7 paid runs, 0 voids, $3.90 against a $10 ceiling. All cells Claude
Code CLI, sonnet, isolated `CLAUDE_CONFIG_DIR`, hidden oracle.

## What shipped (commit `a32d6f8`)

**Runner `-Hooks` subset selector** (`benchmarks/run-maestro-bench.ps1`):
with `-InstallHooks`, stages only the named hooks by short name
(`-Hooks gate-reminder`) — the filter applies to BOTH the staged
`hooks/*.cjs` copies AND the `hooks.json` wiring written into the
isolated `settings.json` (parsed, entries kept only when their command
references a selected hook; emptied matcher groups and event keys
dropped). Default (no `-Hooks`) stages the whole pack — previous
behavior unchanged. Result rows carry `hook_set` (`pack` or the
comma-joined subset).

- S10 contract: component = runner; failure mode = pack-vs-single-hook
  effects not attributable (cell A bundled all 6 hooks, so its t12
  spawn increase could not be pinned on `gate-reminder`); falsifying
  check = the generated config-hooks `settings.json` contains ONLY the
  selected hook's wiring and cell C streams carry ZERO
  `maestro-doctrine-guard` markers; rollback = revert `a32d6f8`.
  **RATIFIED**: subset install verified structurally after both the
  throwaway and cell C invocations (`settings.json` = one
  `UserPromptSubmit` entry, staged dir = `maestro-gate-reminder.cjs`
  alone; the no-`-Hooks` invariance run staged all 6 files and all 6
  event keys), and all 6 cell C streams carry 0 doctrine-guard
  markers while doctrine reads succeeded 12/12 (guard genuinely
  absent, below).

## Cell C: does gate-reminder alone reproduce the spawn increase?

t12 (16-file feature), sonnet, ON, n=6, `-InstallHooks -Hooks
gate-reminder -SaveStream`, cap $2.00/run. `20260611-144458`.
Comparison cells reused from disk, never re-run.

| Cell | n | Pass | Med cost | Med turns | Med out-tok | Med think chars | Main spawns per run |
|---|---|---|---|---|---|---|---|
| t12 kernel-ON (no hooks) `20260611-032459` | 6 | 6/6 | $0.4914 (rng 0.425-0.673) | 20.5 | 8,519 | 4,209 | [1,1,2,1,1,1] |
| t12 cell A (full pack) `20260611-124009` | 6 | 6/6 | $0.5851 (rng 0.495-0.820) | 23.5 | 10,110 | 6,340 | [1,4,7,2,1,1] |
| t12 cell C (gate-reminder only) `20260611-144458` | 6 | 6/6 | $0.5833 (rng 0.456-0.979) | 22.5 | 9,835 | 5,814 | [2,6,2,2,2,2] |

**Answer: yes — and more consistently than the full pack.** Cell C
produced a multi-agent gate verdict in 6/6 runs (cell A: 4/6;
unhooked baseline: 1/6, with the gate line missing entirely in 2/6),
and every cell C run spawned at least one specialist subagent on top
of the universal read-only Explore spawn. The baseline spawns exactly
1 (the Explore) in 5 of 6 runs. The doctrine-guard, subagent-guard,
loop-guard, phase-scope, and gate-telemetry hooks are not needed to
move spawn behavior: the S1 checklist injection alone does it.

**Did the spawning buy anything?** No. Oracle pass was 6/6 in all
three cells — spawning costs more with no measurable quality delta on
this fixture. Cost detail, honestly labeled: the cell C median is
+$0.092 (+19%) over baseline, but the gap sits inside both
within-mode spreads (baseline 0.248, cell C 0.523 wide) — **NULL
under the pre-declared spread rule**, the same verdict cell A got.
Per-run cost-vs-spawn at n=6 is descriptive only: the one 6-spawn run
(r2) is also the cell's cost maximum ($0.9794), and the five 2-spawn
runs span $0.4565-0.6799.

Compliance signals (committed scorer): status token 6/6 (r1
UNVERIFIED, r2-r6 VERIFIED, all claim-consistent), surgical scope
6/6, oracle tamper-free 6/6, smoke-tested 6/6.

### Doctrine-read control

Cell C has no doctrine-guard installed, so S7.2 re-reads should be
attempted AND succeed — they were: 12 read attempts of
`AGENTS.md`/`CLAUDE.md` across 6 runs (per-run [3,2,2,2,2,1]), 12
successful, 0 denials, 0 guard markers in any stream. Cell A's t12
runs made 12 attempts and saw 12 denials. Same model, same task, same
prompt-side hook (gate-reminder active in both): the only delta is
the guard, which confirms the guard — not chance or model drift —
produced the hook-enforcement loop's 0 successful re-reads.

## Verdict-spawn gap (all cells on disk + cell C)

Gate verdicts counted from main-thread assistant text blocks matching
`GATE: files=` (never raw grep: init-event tool lists and file-read
echoes false-positive); spawns counted from main-thread `Task`/`Agent`
`tool_use` blocks. Every single run in every cell spawns exactly one
read-only `Explore` agent during orientation — compatible with a
single-agent verdict, so the gap is defined over *specialist*
(non-Explore) spawns. Sidechain spawn count is 0 everywhere except
one cell C run (r2, 2 nested spawns).

| Cell | Verdicts multi/single/none | Multi-verdict, no specialist spawned | Single-verdict, specialist spawned |
|---|---|---|---|
| t08 kernel-ON | 0/6/0 | — | 0/6 |
| t08 cell A (pack) | 0/6/0 | — | 0/6 |
| t12 kernel-ON | 1/3/**2** | 0/1 | 0/3 |
| t12 cell A (pack) | 4/2/0 | **1**/4 | 0/2 |
| t12 cell B (pack + cap 1024) | 4/2/0 | **1**/4 | 0/2 |
| t12 cell C (gate-reminder) | 6/0/0 | 0/6 | — |

Findings, in order of weight:

1. **Single-agent verdicts are never violated**: 0 specialist spawns
   across all 19 single-verdict runs. The verdict line binds in that
   direction.
2. **Multi-agent verdicts execute imperfectly under the full pack**:
   1 of 4 multi-verdict runs in each of cell A and cell B declared
   multi-agent and then spawned nothing but the Explore — a verdict
   stated, not executed (the S1 "executed, not noted" failure mode).
   Cell C: 0 of 6.
3. **The unhooked t12 baseline omitted the gate line in 2/6 runs**;
   no hooked cell ever omitted it (0/18). gate-reminder eliminates
   gate-line omission on the multi-concern task.
4. t08 (10-module refactor, single dependency chain) draws a
   single-agent verdict in 12/12 runs across both its cells — the
   gate discriminates by task shape, as designed.

## Latency: thinking cap (pre-declared rule -> observation only)

Rule declared before analysis: run cell D (cap-1024 replication,
n=6 -> combined n=12) only if the cell B vs cell A `agent_ms` median
gap exceeds both cells' within-mode spreads. Measured (`agent_ms` =
CLI `duration_ms`, not runner wall time):

| Cell | n | Median agent_ms | Range | Spread |
|---|---|---|---|---|
| t12 cell A | 6 | 239,420 | 207,080-292,764 | 85,684 |
| t12 cell B (cap 1024) | 6 | 205,265 | 131,722-270,540 | 138,818 |
| t12 kernel-ON | 6 | 201,649 | 162,421-235,116 | 72,695 |

Gap = 34,156 ms — inside both spreads (85,684 and 138,818). **Cell D
not run; the cap's latency benefit stays an observation, not a
claim.** Descriptively the cap cell's median lands on the unhooked
baseline's (205s vs 202s), consistent with the hooks' latency cost
being thinking-driven — but n=6 spreads this wide cannot carry that
as a claim.

## Reproduction

```powershell
# subset-hooked cell (this branch)
& .\benchmarks\run-maestro-bench.ps1 -Task t12-feat-export-subsystem -Mode on -Runs 6 -Model sonnet -MaxBudgetUsd 2.0 -SaveStream -InstallHooks -Hooks gate-reminder
# scoring
node benchmarks/score-compliance.cjs --dir benchmarks/results/streams/20260611-144458-claude-sonnet
# structural check of the subset install (after any -InstallHooks -Hooks run)
Get-Content "$env:TEMP\maestro-bench\config-hooks\settings.json"
```

## Rollback

`git revert a32d6f8` (subset selector + `hook_set` row field). Scorer,
oracle, fixtures, hooks, doctrine untouched by this loop.

## Run accounting

| Batch | Runs | Valid | Voids | Cost |
|---|---|---|---|---|
| t01 throwaway, `-Hooks gate-reminder` `20260611-144222` | 1 | 1 | 0 | $0.1026 |
| t12 cell C `20260611-144458` | 6 | 6 | 0 | $3.7989 |
| **Total** | **7** | **7** | **0** | **$3.9015** |

Ceiling $10.00; spent $3.90. Cell D ($3.3 sketched) not run — its
pre-declared trigger did not fire.
