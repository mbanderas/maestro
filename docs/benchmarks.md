# Maestro Benchmarks — Full Data

## Benchmarks

Maestro ships a reproducible A/B harness in [`benchmarks/`](benchmarks/):
thirteen fixture tasks (single-file fixes through hidden-invariant
features, a 19-file validation sweep, a multi-concern subsystem
with a deliberately underspecified spec, and a trap-convention tier
with code-only invariants), a runner for Windows and macOS/Linux
(no npm/package deps; the macOS/Linux script needs `jq`), and a
deterministic `verify.cjs` checker per task. Each task runs with Maestro ON (doctrine files in
the work dir) vs OFF (absent), under an isolated `CLAUDE_CONFIG_DIR`
so global config cannot contaminate either cell, and the checker stays
**hidden from the agent until the run ends** (visible oracles inflate
pass rates 20-60%, arXiv:2602.10975). Protocol, scoring rubric, and
Codex/Gemini recipes: [`benchmarks/README.md`](benchmarks/README.md).

Current cells (Claude Code, `sonnet`, hidden-oracle runner,
2026-06-10/11; medians of valid runs, voided CLI-error runs excluded
and documented):

| Cell | n | Pass | Med wall | Med turns | Med cost | Med out-tok |
|---|---|---|---|---|---|---|
| t07 OFF | 3 | 3/3 | 70s | 12 | $0.164 | 2,421 |
| t07 ON | 3 | 3/3 | 71s | 15 | $0.228 | 2,799 |
| t08 OFF | 9 | 9/9 | 80s | 24 | $0.230 | 4,467 |
| t08 ON | 9 | 9/9 | 59s | 25 | $0.253 | 4,411 |
| t09 OFF | 9 | 8/9 | 147s | 19 | $0.287 | 5,160 |
| t09 ON | 9 | 8/9 | 143s | 18 | $0.315 | 5,478 |
| t09 CORE | 6 | 6/6 | 137s | 20.5 | $0.345 | 5,231 |
| t10 OFF | 5 | 5/5 | 29s | 6 | $0.101 | 1,607 |
| t10 ON | 5 | 5/5 | 51s | 9 | $0.169 | 2,949 |
| t11 OFF | 1 | 1/1 | 238s | 37 | $0.507 | 12,924 |
| t11 ON | 1 | 1/1 | 201s | 37 | $0.533 | 9,905 |
| t12 OFF | 9 | 9/9 | 175s | 21 | $0.343 | 6,529 |
| t12 ON | 9 | 9/9 | 143s | 25 | $0.475 | 6,882 |

Three further claims were measured on 2026-06-10, then re-measured at
higher n (t12 and t08 topped up to n=9 per mode, a purpose-built
trap-convention task probed three times on haiku, a two-turn
interactive-proxy probe, and three Decision-Gate activation probe
cycles on 2026-06-11; 84 valid runs across the three loops, 0
voids):

- **Weak-model rescue: not measurable, now with stronger evidence.**
  Haiku passes 30/30 across t07-t11 in both modes, and 9/9 on all
  three difficulty versions of t13, a task purpose-built to fail it
  (trap defaults, code-only invariants, boundary arithmetic; two
  hardening cycles under a pre-declared calibration protocol). A
  haiku-4.5 baseline does not fail on self-contained ~20-file
  fixtures with discoverable conventions, so pass-rate rescue cannot
  be observed at this task class. (Haiku cells live in the frontier
  and follow-up summaries, never in the sonnet table above.)
- **The multi-agent path (S2-S6) still never fires, but the gate now
  speaks.** t12 was built to trip the Decision Gate (three concerns,
  7 files touched across a 16-file app, spec resolvable only through
  `docs/conventions.md`). All 18 baseline headless runs and all 3
  interactive-proxy sessions: one Explore recon at most, zero
  Planner/specialist/review agents, zero gate verbalization. Three
  successive S1 revisions (required verdict line; counted verdict
  with triggers checked first; closed downgrade set) were then probed
  ON n=3 each (2026-06-11): verdict lines appeared in **9/9** probe
  runs (the first gate verbalization ever measured) with correct
  file/concern counts above the trigger, and every verdict still
  concluded single-agent. S2-S6 spawns: **0/9**. Each revision's
  rationale bent a different clause (perceived parallelism, the
  homogeneity constraint, then the downgrade conditions themselves)
  toward the model's solo prior; the sub-trigger guardrail (t01)
  never false-fired. Prose doctrine gets the gate verbalized and
  counted; it does not move sonnet across the spawn threshold on a
  16-file fixture. Maestro's measured effects come from the universal
  rules (S7-S10), not orchestration. The hook injection is what
  finally moves it: with `gate-reminder` installed — alone, no other
  hook — t12 drew a multi-agent verdict and spawned at least one real
  specialist in 6/6 runs, at no measurable quality delta on a fixture
  both cells already pass 6/6 (spawning costs more and buys nothing
  here; spawn-isolation summary). The verdict line also binds: across
  all 19 single-agent-verdict runs on disk no specialist was ever
  spawned, while 2 of 8 full-pack multi-agent verdicts were stated
  but never executed — a gap the single-hook cell closed at 0 of 6.
  A `verdict-only` variant was tested and removed after a 2026-06-12
  smoke moved the wrong way (same 3/3 pass rate, higher median cost,
  more turns, no reduced-spawn evidence). The default stays on the
  measured spawn reminder; shorter wording cost more behaviorally.
- **Compliance deltas are null at these tiers.** Three runs in 69
  scored streams stated a S7.3 status token: one honest UNVERIFIED
  (t12 ON), two t08 ON runs claiming VERIFIED with no check run
  (scored claim-inconsistent). Surgical scope and oracle integrity
  remain perfect in both modes. Prose doctrine alone does not move
  headless reporting behavior, which is why the verification hook
  enforces it structurally.

### Retractions

Honest reading: **Maestro ON has never beaten OFF on success rate in
any measured cell**: at n=9 t09 is exactly tied (8/9 each) and t08
and t12 are 9/9 both modes. The efficiency story did not survive
replication: the t12 n=3 readings of -31% wall and -20% out-tokens
were retracted at n=9 (wall gap inside within-mode spread, out-tokens
reversed to +5%, ON +38% median cost and +4 median turns), and the
t08 n=3 readings of -30% wall / -18% turns / -8% cost are now **also
retracted** at n=9: turns and cost reversed outright (+4% turns, +10%
cost), out-tokens flattened to -1%, and the remaining wall gap
(-25.5%, 20.3s) sits inside the OFF cell's own 47.4s run-to-run
range. What remains standing but unreplicated: the Gemini t08 cell
(-40% wall, n=3, a different CLI, never merged with Claude rows) and
the t11 pilot (-16% wall at n=1). On small or linear tasks the
doctrine is pure overhead (t10: +78% median wall). t09 separates
*models* more than modes: gemini-3.1-pro-preview passes 1 of 6 valid
runs, gpt-5.4-mini passes 4/4, sonnet ~8-in-9. The CORE row (compact
~50-line variant) shows no efficiency gain over the full doctrine.
Small samples throughout; no significance claims.

A first directional signal on a different axis. **t14**
(`t14-feat-revenue-rollup`, a checker-less trap task with a
non-obvious correctness property, n=6 OFF vs ON, Claude Code
`sonnet`) holds both arms at **6/6 pass** — so no pass-rate or
capability claim — while the primary honesty metric
`claim_consistent` runs **OFF 1/6 vs ON 4/6** and
`target_smoke_tested` **OFF 0/6 vs ON 2/6**, at ON median cost
**$0.1930** vs OFF **$0.1501** (ON about **+29%**). The
`status_token` axis is **excluded**: OFF was never taught the S7.3
vocabulary, so scoring it there measures lexicon, not discipline.
Per the frozen prereg this is **directional only, not confirmatory**
— a grounded effect still needs at least n=9, so n=6 is exploratory
by construction. Read narrowly: Maestro buys more honest completion
behavior on a checker-less trap task, at higher cost — not a token
saving, not a higher success rate, not a proven honesty effect. The
older corpus could not demonstrate this earned overhead at all
(capability-ceilinged, scope and oracle already clean in both modes);
t14 is the first directional honesty-axis signal, and it is paid for,
not recovered, by the cost premium.

Full analysis and
void accounting:
[`benchmarks/results/20260610-summary-hidden-oracle.md`](benchmarks/results/20260610-summary-hidden-oracle.md),
[`benchmarks/results/20260610-summary-xcli.md`](benchmarks/results/20260610-summary-xcli.md),
[`benchmarks/results/20260610-summary-frontier.md`](benchmarks/results/20260610-summary-frontier.md),
[`benchmarks/results/20260610-summary-followup.md`](benchmarks/results/20260610-summary-followup.md),
[`benchmarks/results/20260611-summary-activation.md`](benchmarks/results/20260611-summary-activation.md),
[`benchmarks/results/20260611-summary-efficiency.md`](benchmarks/results/20260611-summary-efficiency.md),
[`benchmarks/results/20260611-summary-hooks.md`](benchmarks/results/20260611-summary-hooks.md),
[`benchmarks/results/20260611-summary-spawns.md`](benchmarks/results/20260611-summary-spawns.md),
the t14 honesty-axis result
[`benchmarks/results/20260613-summary-t14.md`](benchmarks/results/20260613-summary-t14.md),
and the earned-overhead re-score
[`benchmarks/results/20260613-summary-earned-overhead.md`](benchmarks/results/20260613-summary-earned-overhead.md).

Post-fix Gemini (`gemini-3.1-pro-preview`) and Codex (`gpt-5.4-mini`,
exploratory n=1) cells for t08/t09, including the gemini quota voids
and a gemini isolation caveat (global `~/.agents` skills load even in
isolated runs), are in
[`benchmarks/results/20260610-summary-xcli.md`](benchmarks/results/20260610-summary-xcli.md).
Earlier same-day results for t01-t06 (and the original Codex/Gemini
small-task cells) were measured **before** the hidden-oracle fix and
are kept as labeled upper bounds in
[`benchmarks/results/`](benchmarks/results/): the agent could read
the checker during those runs, so their pass rates are not comparable.
Numbers are never compared across CLIs or models, and the protocol
forbids publishing numbers that were not actually measured.
