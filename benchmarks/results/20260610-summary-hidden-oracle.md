# Hidden-Oracle Cells — t07-t10, Claude Code sonnet, 2026-06-10

First results measured AFTER the hidden-oracle runner fix (commit
8a525bf): `verify.cjs` lands in the work dir only after the agent
exits. NOT comparable to any summary dated before this fix (those are
labeled oracle-visible upper bounds). Same isolation as always:
fresh `CLAUDE_CONFIG_DIR`, credentials + empty settings only.

Cells: task x mode. Modes: OFF (no doctrine files), ON (full
AGENTS.md + CLAUDE.md), CORE (compact ~50-line
`variants/AGENTS-core.md`, t09 only). Medians; even n = mean of the
two middle values. Success = verify exit 0.

## Validity

45 task-runs executed; **11 voided** (CLI `is_error: true`, 1 turn,
$0.00, ~3.5 s wall — transient API/limit errors, the agent never ran;
1 additional flagged run cut off mid-flight also excluded). Voided
runs are excluded from every number below and were re-run. Detection:
`is_error` + `verify_note` fields recorded per row since 3c73e96.

Raw files (this directory, `20260610-HHmmss-claude-sonnet.json`):
130155, 131532, 132122, 133721, 134852, 135609, 140511.

## Results (valid runs only)

| Cell | n | Pass | Med wall ms | Med turns | Med cost USD | Med out-tokens |
|---|---|---|---|---|---|---|
| t07 OFF | 3 | 3/3 | 69,866 | 12 | 0.164 | 2,421 |
| t07 ON | 3 | 3/3 | 70,710 | 15 | 0.230 | 2,799 |
| t08 OFF | 3 | 3/3 | 85,168 | 33 | 0.247 | 6,127 |
| t08 ON | 3 | 3/3 | 59,310 | 27 | 0.228 | 4,457 |
| t09 OFF | 6 | 5/6 | 128,951 | 19 | 0.299 | 5,211 |
| t09 ON | 6 | 5/6 | 136,853 | 18.5 | 0.316 | 5,502 |
| t09 CORE | 6 | 6/6 | 136,990 | 20.5 | 0.345 | 5,231 |
| t10 OFF | 5 | 5/5 | 28,533 | 6 | 0.101 | 1,607 |
| t10 ON | 5 | 5/5 | 50,746 | 9 | 0.169 | 2,949 |

## Reading (honest)

- **t09 is the suite's first discriminating cell**: both OFF and ON
  drop below 100% (5/6 each). The hidden-invariant design works as
  difficulty; it does not separate the doctrine — pass delta is 0.
  At n=6 a single run is ~17 pp; differences this size are noise
  (arXiv:2602.07150 floor).
- **t08 is the first cell where the doctrine pays for itself**: ON
  beats OFF on wall (-30%), turns (-18%), cost (-8%), and out-tokens
  (-27%) at equal 3/3 pass. Consistent with the doctrine's
  verification rules shortening a convention-heavy refactor. n=3 —
  directional, not significant.
- **t07 and t10 show the familiar overhead pattern**: ON adds turns
  and cost with no pass-rate change (t10 ON +78% median wall).
- **CORE (compression hypothesis, Track D)**: 6/6 pass but no
  efficiency gain over full ON on t09 (cost $0.345 vs $0.316, turns
  20.5 vs 18.5 — within noise). The blog-grade claims that shorter
  instruction files cut cost did not replicate on this cell; the
  6/6 vs 5/6 pass difference is one run, i.e. noise.
- **No capability claim**: across every measured cell, Maestro ON has
  never beaten OFF on success rate. Maestro's measured value so far is
  process discipline on convention-heavy refactors (t08 pattern), not
  rescuing tasks the baseline fails.

## Per-cell composition

t07/t08: pilot n=1 + escalation n=2 per mode. t09 OFF: pilot + diag +
escalation x4. t09 ON: pilot + diag + escalation r1 + re-run x3 (3
voids replaced). t09 CORE: single n=6 batch. t10: pilot + re-run x4
per mode (8 voids replaced). Mixed batches share runner version for
all agent-visible behavior; the only mid-day runner changes were
post-exit bookkeeping (verify_note recording, 3c73e96) and the core
mode (0a8f49c).
