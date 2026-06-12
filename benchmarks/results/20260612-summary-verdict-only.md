# Verdict-only gate-reminder smoke - 2026-06-12

Purpose: test whether removing the spawn imperative from
`maestro-gate-reminder` could reduce t12 token spend while preserving
quality. Result: rejected. The n=3 smoke moved the wrong way on cost,
turns, and output tokens, and it did not reduce spawning.

Raw rows: `20260612-234405-claude-sonnet.json`. Streams:
`streams/20260612-234405-claude-sonnet/**`. All runs Claude Code CLI,
sonnet, `t12-feat-export-subsystem`, ON, `-InstallHooks -Hooks
gate-reminder`, with `MAESTRO_GATE_REMINDER_MODE=verdict-only`.

## Result

| Cell | n | Pass | Med cost | Med turns | Med out-tok | Total cost |
|---|---:|---:|---:|---:|---:|---:|
| t12 gate-reminder spawn baseline | 6 | 6/6 | $0.5833 | 22.5 | 9,835 | $3.7989 |
| t12 verdict-only smoke | 3 | 3/3 | $0.7992 | 28 | 10,431 | $2.4182 |

Per-run verdict-only costs: $1.0974, $0.7992, $0.5216.
Per-run turns: 28, 33, 23. Per-run output tokens: 13,297, 10,431,
10,142.

Compliance stayed clean in the deterministic scorer: pass 3/3,
smoke-tested 3/3, status token 3/3, claim-consistent 3/3, surgical
scope 3/3, oracle tamper-free 3/3.

Spawn parsing showed no reduced-spawn evidence: every run still
spawned at least a Planner, with total Task/Agent tool-use counts of
8, 6, and 2. The shorter reminder removed prompt bytes but did not
remove the behavioral cost path.

## Interpretation

This is enough to reject the savings hypothesis and remove the
experimental mode. It is not enough to publish a definitive
"verdict-only is 37% worse" claim: the smoke is n=3, compared against
an older n=6 baseline, and both cells have wide within-cell spreads.

Standing conclusion: keep the measured default `spawn` reminder.
Shorter wording can cost more when it removes useful behavioral
compression.

## Reproduction

```powershell
$env:MAESTRO_GATE_REMINDER_MODE='verdict-only'
pwsh -NoProfile -File benchmarks/run-maestro-bench.ps1 `
  -Task t12-feat-export-subsystem `
  -Mode on `
  -Runs 3 `
  -Model sonnet `
  -MaxBudgetUsd 6 `
  -SaveStream `
  -InstallHooks `
  -Hooks gate-reminder
Remove-Item Env:\MAESTRO_GATE_REMINDER_MODE

node benchmarks/score-compliance.cjs --dir benchmarks/results/streams/20260612-234405-claude-sonnet
node benchmarks/parse-spawns.cjs --dir benchmarks/results/streams/20260612-234405-claude-sonnet
```
