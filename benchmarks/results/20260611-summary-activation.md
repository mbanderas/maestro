# Activation loop summary — 2026-06-11

Closes the three items left open by the follow-up loop
([20260610-summary-followup.md](20260610-summary-followup.md)): the
unreviewed PENDING_REVIEW harness mutations, the t08 n=3 efficiency
claim, and the never-firing S2-S6 path. All cells Claude Code CLI,
isolated `CLAUDE_CONFIG_DIR`, hidden oracle. 24 paid runs, 0 voids,
$7.88 total. Baseline doctrine for comparisons: commit `f8dc9b7`.

## 1. PENDING_REVIEW closures: all three RATIFIED, no fixes needed

Each falsifying check was run independently by this loop (a reviewer
pass distinct from the loop that shipped the mutation):

- **`.markdownlint-cli2.jsonc` RATIFIED** — clean tree exits 0
  (7 files, 0 errors); a deliberate MD012 violation injected into
  README.md exits 1 with both errors flagged; the same violation in
  `benchmarks/results/_lint-probe.md` produces silence (exit 0, still
  "7 file(s)" — exclusions real). Tree restored afterward.
- **`probe-interactive-s2s6.cjs` RATIFIED** — an independent parser
  re-derived spawn counts from the committed streams
  (`streams/20260610-220142-interactive-proxy-sonnet`) and re-derived
  pass/fail by replaying every successful Write/Edit call onto a
  fresh fixture copy and running the hidden oracle: all 3 runs match
  the committed `agent_spawns` (one Explore each), `pass` (F/T/F),
  and byte-exact `verify_note` strings.
- **t13 `verify.cjs` v3 RATIFIED** — pristine fixture fails (exit 1,
  "unknown command: purge-stale"), the machine-local gold copy passes
  (exit 0), and the pristine data is internally consistent
  (stats.json `{customers:3, tickets:7, comments:6}` equals live data
  file lengths; the 1-record archives are correctly excluded from
  active counts).

## 2. t08 at n=9: the -30%/-18%/-8% claim is RETRACTED

Existing valid hidden-oracle rows confirmed first: n=3 per mode
(`20260610-130155` 1/mode + `20260610-133721` 2/mode) — these
reproduce the README's claimed medians exactly. The six t08 rows in
`20260610-043338` predate the hidden-oracle fix and were excluded.
Six more runs per mode (`20260611-000015`, streams alongside) were
unioned with the valid three; medians recomputed over all 9 valid
rows per mode — never averaged medians. t08 pristine-fail was
re-verified before the batch (exit 1).

| Cell | n | Pass | Med wall | Med turns | Med cost | Med out-tok |
|---|---|---|---|---|---|---|
| t08 OFF | 9 | 9/9 | 79,592 ms (range 52,296-99,705) | 24 | $0.2299 | 4,467 |
| t08 ON | 9 | 9/9 | 59,310 ms (range 51,699-75,136) | 25 | $0.2529 | 4,411 |

Decision rule (stated before the batch): claim only if the ON-OFF
wall-median gap clearly exceeds within-mode spread. It does not: the
gap is -20,282 ms (-25.5%) against an OFF within-mode range of
47,409 ms (the gap roughly equals the OFF IQR). The companion n=3
readings reversed outright: turns 24→25 (**+4.2%**), cost
$0.2299→$0.2529 (**+10.0%**); out-tokens flattened to -1.3%.
**All three t08 efficiency readings are retracted.** Honest residual,
not a claim: the wall direction persisted at n=9 and the ON
distribution is tighter (23k vs 47k range). The Gemini t08 cell
(-40% wall, n=3) is a different CLI and stands as its own labeled
row, unmerged.

ON-arm provenance note: 3 of 9 ON rows ran under doctrine `1b0ce4a`
(v1.1), 6 under `f8dc9b7` (adds S7.3 status vocabulary + S10
harness-mutation contract). The union was pre-sanctioned by the loop
charter; the delta is reporting/long-horizon doctrine, not task
mechanics. OFF rows carry no doctrine file and are unaffected.

Compliance over the 12 new streams (scorer exit 0): surgical_scope
12/12, no_oracle_tamper 12/12, verification_ran 0/12, smoke_tested
0/12, status_token 2/12 — both ON runs stating **VERIFIED with no
check run**, scored claim-inconsistent. Spawn topology: zero S2-S6;
at most one default Explore recon (7/12 runs).

## 3. Decision Gate activation: verbalization achieved, spawns triple-null

Pre-registered hypothesis (from re-parsing 9 committed t12 ON
streams: zero gate-related assistant text in every run): the gate
never fires because it is descriptive prose with (H1) no imperative
binding the multi-agent branch to the Task/Agent tool, (H2) no
required output making the evaluation visible, and (H3) a constraint
list whose single-agent bias makes silent skipping the cheapest
compliant behavior.

Three bounded revision cycles, each probed with t12 ON n=3 (its
triggers are met: 6-8 files counted by the model itself, 3-4
concerns) plus a t01 ON guardrail run that must spawn zero agents.
Spawn metric: assistant-event `tool_use` blocks named Task/Agent,
Explore recon excluded; verdict metric: assistant text blocks only
(file-read echoes excluded by event type).

| Cycle | Doctrine | Revision | Verdict lines | S2-S6 spawns | Guardrail | Oracle |
|---|---|---|---|---|---|---|
| 1 | `9fbb2de` | verdict line required + spawn imperative (S1/S2) | 3/3 | 0/3 | clean | 3/3 |
| 2 | `f890479` | counted verdict, triggers checked first | 3/3 (counts correct) | 0/3 | clean | 3/3 |
| 3 | `1f86bc8` | downgrade set closed to two conditions | 3/3 (counts correct) | 0/3 | clean | 3/3 |

The trail is diagnostic: cycle 1 verdicts cite "no parallel benefit"
without counting; cycle 2 verdicts count correctly (files=6-7,
concerns=3-4 — trigger met) then downgrade via the homogeneity
constraint; cycle 3 verdicts misquote the closed downgrade set
itself ("single dependency chain" over 6-7 files where the rule says
<=3; ">60% shared files" while naming 3 shared of 8 counted). Each
tighter rule changed *which* clause got bent, not the conclusion.

**Result: 9/9 verdict verbalization (baseline: zero in all 21
previously scanned streams — 18 headless t12 + 3 proxy), 0/9
spawns. Publishable null: prose doctrine alone gets the gate spoken
and counted but does not move sonnet across the spawn threshold on a
16-file fixture — the binding constraint is the model's solo prior,
not gate wording.** No n=9 activation cell was run (protocol required
a >=2/3 spawn rate first), so no activation-vs-baseline medians
exist and none are published. All three revisions are kept: they are
non-regressive on every guardrail (oracle 12/12 across probes, t01
never false-fired, probe wall/turns/cost within baseline spread) and
the verdict line makes gate misclassification auditable.

Cost of activation honestly: $4.87 of probes for a behavioral change
that is real (verbalization) but did not reach the goal (spawns).
Probe medians sat within the baseline t12 ON n=9 spread; no
efficiency claim is made from n=3 probes.

Companion deliverables, each with its own ratified falsifying check:

- `benchmarks/parse-spawns.cjs` — event-classified spawn + verdict
  parser (ratified against committed proxy streams and a synthetic
  control with tool_result echoes and init-event tool lists; its
  first version missed the counted verdict format and was fixed and
  re-ratified before any conclusion was recorded).
- `hooks/maestro-gate-reminder.cjs` + tests + `hooks.json` wiring —
  injects the S1 checklist on the first prompt of an interactive
  session (fire-once, opt-out via `MAESTRO_GATE_REMINDER=0`). Hooks
  cannot fire under the benchmark runner's isolation (empty
  `settings.json`, no `.claude/` in work dirs), so this ships as an
  interactive-session aid ratified by its unit tests (9/9), not as
  headless gate evidence.
- [`docs/interactive-s2s6-runbook.md`](../../docs/interactive-s2s6-runbook.md)
  — the manual TTY protocol for the one configuration no autonomous
  loop can measure.

## Run accounting

| Batch | Runs | Valid | Voids | Cost |
|---|---|---|---|---|
| t08 top-up (sonnet, 6/mode) `20260611-000015` | 12 | 12 | 0 | $3.0105 |
| Cycle-1 probe `20260611-002315` + guardrail `-003418` | 4 | 4 | 0 | $1.6589 |
| Cycle-2 probe `20260611-003751` + guardrail `-004917` | 4 | 4 | 0 | $1.6614 |
| Cycle-3 probe `20260611-005435` + guardrail `-010519` | 4 | 4 | 0 | $1.5491 |
| **Total** | **24** | **24** | **0** | **$7.8799** |

Budget ceiling $25.00; spent $7.88. The ~$6 n=9 activation-cell line
was not spent (its precondition — spawn rate >=2/3 — was never met).
