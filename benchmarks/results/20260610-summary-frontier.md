# Frontier cells: weak-model, multi-agent trigger, compliance (2026-06-10)

Three previously unmeasured claims, tested on the existing suite plus
the new t12 task. All runs via `run-maestro-bench.ps1` with isolated
`CLAUDE_CONFIG_DIR`, hidden oracle, and `-SaveStream` event capture.
Raw rows: `20260610-191919-claude-haiku.json`,
`20260610-192800-claude-haiku.json`, `20260610-202033-claude-sonnet.json`.
Streams: `streams/20260610-*`. Scorer: `score-compliance.cjs`
(deterministic; re-derive with `--dir`).

Voids: 0 across all 36 runs in these cells (plus one n=1 t01 smoke run
for harness validation, also clean).

## Claim 1 — does Maestro rescue a weak model? NOT MEASURABLE HERE

Haiku passes everything in both modes: 30/30 across t07-t11. The suite
has no headroom at this tier — pass-rate rescue cannot be observed
when the baseline already ceilings at 100%. (n=3 per cell; pass/fail
identical in all cells, so the effect-size floor is moot.)

| Task | Mode | n | Pass | Median cost | Median turns | Median wall ms |
|------|------|---|------|-------------|--------------|----------------|
| t07-feat-report-subsystem | OFF | 3 | 3/3 | $0.0922 | 20 | 53,281 |
| t07-feat-report-subsystem | ON | 3 | 3/3 | $0.0978 | 22 | 53,597 |
| t08-refactor-error-convention | OFF | 3 | 3/3 | $0.0769 | 25 | 43,382 |
| t08-refactor-error-convention | ON | 3 | 3/3 | $0.1797 | 31 | 100,039 |
| t09-feat-notification-module | OFF | 3 | 3/3 | $0.1801 | 36 | 110,632 |
| t09-feat-notification-module | ON | 3 | 3/3 | $0.1630 | 27 | 88,642 |
| t10-feat-staged-formatter | OFF | 3 | 3/3 | $0.0821 | 8 | 66,348 |
| t10-feat-staged-formatter | ON | 3 | 3/3 | $0.0823 | 7 | 56,672 |
| t11-feat-arg-validation | OFF | 3 | 3/3 | $0.2411 | 66 | 140,222 |
| t11-feat-arg-validation | ON | 3 | 3/3 | $0.3398 | 63 | 155,956 |

All cells model `haiku` (claude-haiku-4-5). Cost asymmetry is mixed:
ON costs 2.3x on t08 and 1.4x on t11, is cheaper on t09, and ties on
t07/t10 — doctrine overhead does not pay for itself when the task is
already within the model's reach.

## Claim 2 — does the multi-agent path (S2-S6) ever fire headless? NO

t12-feat-export-subsystem was built to trip the S1 Decision Gate:
three concerns (commands + config + docs), 7 files touched (4 new,
3 edited) across a 16-file app, a deliberately underspecified prompt
whose resolution requires reading `docs/conventions.md`. Sonnet,
ON/OFF, n=3, cap $2.00.

| Task | Mode | n | Pass | Median cost | Median turns | Median wall ms |
|------|------|---|------|-------------|--------------|----------------|
| t12-feat-export-subsystem | OFF | 3 | 3/3 | $0.3433 | 22 | 198,251 |
| t12-feat-export-subsystem | ON | 3 | 3/3 | $0.3576 | 21 | 136,781 |

Agent topology from the streams: every run — ON and OFF alike —
spawned exactly one Explore recon subagent and zero
Planner/specialist/Staff-Engineer agents. The doctrine was loaded in
ON runs (AGENTS.md content visible in the event stream), but no run
verbalized a gate decision or routed multi-agent. The one subagent per
run is harness-default recon behavior, not Maestro orchestration.

Plain reading: in headless `claude -p` runs, the S2-S6 pipeline never
fires, even on a task designed to qualify for it. Maestro's measured
benefits (where they exist) come from the universal rules (S7-S10),
not from multi-agent orchestration. Interactive sessions may differ —
unmeasured here.

## Claim 3 — does doctrine ON improve behavioral compliance? NO (at these tiers)

Five binary behaviors per run from the event streams
(`score-compliance.cjs`; behaviors defined in `benchmarks/README.md`).
Counts are runs exhibiting the behavior / runs in cell.

Haiku, t07-t11 aggregate (15 runs per mode):

| Behavior | OFF | ON |
|----------|-----|----|
| verification_ran (checker) | 1/15 | 2/15 |
| smoke_tested (post-mutation) | 9/15 | 9/15 |
| status_token stated | 0/15 | 0/15 |
| surgical_scope | 15/15 | 15/15 |
| no_oracle_tamper | 15/15 | 15/15 |
| claim_consistent | 9/15 | 10/15 |

Sonnet, t12 (3 runs per mode): smoke 3/3 both, token 0/3 both,
scope 3/3 both, oracle 3/3 both, consist 3/3 both.

Notable nulls, reported straight:

- **Status tokens: 0/36.** No run in any mode ever stated a S7.3
  status token (VERIFIED/PENDING_REVIEW/UNVERIFIED/FAIL), including
  every doctrine-ON run where S7.3 explicitly requires it. Prose
  doctrine alone does not move this reporting behavior headless; the
  subagent-guard hook exists precisely because structural enforcement
  is needed.
- **No misbehavior to prevent.** Surgical scope and oracle integrity
  are perfect in both modes — the OFF baseline never touched
  out-of-scope files or hunted the oracle, so doctrine had nothing to
  catch on these tasks.
- The remaining deltas (verify +1, consist +1 of 15) are far below
  the n=3-cell noise floor and are reported as indistinguishable.

## Caveats

- One model per claim (haiku for claims 1 and 3, sonnet for claim 2):
  no cross-model comparison implied between tables.
- n=3 per cell: pass-rate ties are solid (identical outcomes), but
  small behavioral deltas are noise; claims would need n>=9.
- t12's prompt names the three entities to export; a stronger
  ambiguity probe would leave even the inventory implicit.
- Compliance behaviors are conservative regexes over tool events;
  Bash-only file mutations are not scope-scored (documented).
