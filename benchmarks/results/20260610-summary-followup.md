# Follow-up loop summary — 2026-06-10 (evening)

Closes the four items left open by the frontier loop
([20260610-summary-frontier.md](20260610-summary-frontier.md)):
the t12 n=3 wall claim, the missing haiku-failing tier, the
interactive-session S2-S6 gap, and the missing markdown checker.
All cells Claude Code CLI, isolated `CLAUDE_CONFIG_DIR`, hidden
oracle. 0 voids across all 24 paid runs ($9.28 total).

## 1. t12 at n=9: the -31% wall claim is RETRACTED

Six more sonnet runs per mode (raw: `20260610-213829-claude-sonnet.json`,
streams alongside) unioned with the original three
(`20260610-202033-claude-sonnet.json`). Medians recomputed over all 9
valid rows per mode — never averaged medians.

| Cell | n | Pass | Med wall | Med turns | Med cost | Med out-tok |
|---|---|---|---|---|---|---|
| t12 OFF | 9 | 9/9 | 174,956 ms | 21 | $0.3433 | 6,529 |
| t12 ON | 9 | 9/9 | 143,050 ms | 25 | $0.4753 | 6,882 |

Decision rule (stated before the batch): claim only if the n=9 gap is
clearly outside within-mode spread. It is not. The n=3 reading of
-31% wall shrank to -18.2% (-31,906 ms) while within-mode ranges are
96k ms (OFF: 123,476-219,744) and 157k ms (ON: 123,773-280,459) —
the gap sits well inside run-to-run noise. The companion n=3 reading
of -20% out-tokens reversed outright (+5% at n=9). **Both t12
efficiency readings are retracted.** What n=9 does show: ON pays
+38% median cost and +4 median turns at identical 9/9 pass.

## 2. Haiku-failing tier: double null — rescue unmeasurable

t13-feat-retention-purge (`tasks/t13-feat-retention-purge/`) was
purpose-built to fail a weak baseline and hardened twice under the
pre-declared calibration protocol (haiku OFF n=3 probe per version,
max 2 hardening cycles). Haiku passed every probe:

| Version | Difficulty levers | Haiku OFF | Med wall | Med turns | Med cost |
|---|---|---|---|---|---|
| v1 (fe2f7a5) | dry-run default, exit-3 empty plan, config 45 vs 30-day prose, referenceDate vs wall clock, comment cascade — all documented | 3/3 PASS | 109,497 ms | 38 | $0.2077 |
| v2 (a0a9f73) | + contract spec moved out of docs into reference impl (archive-tickets), undocumented stats.json invariant (code-only), archiveDays 90 vs retentionDays 45 confusion | 3/3 PASS | 104,380 ms | 35 | $0.1879 |
| v3 (33d99ff) | + boundary record at exactly 45 days (strict >), pre-seeded archive exempt from purge, undocumented append-only events.log invariant | 3/3 PASS | 99,919 ms | 32 | $0.1646 |

Raw: `20260610-222159 / -224004 / -225258 -claude-haiku.json` + streams.

9/9 passes across three difficulty versions at 28-56 turns per run.
Stream forensics: haiku systematically reads every doc and source file
before coding, then clears trap conjunctions (including two invariants
that exist only as code patterns). **Conclusion: a haiku-4.5 baseline
is not failable on self-contained ~20-file fixtures with discoverable
conventions within this protocol's hardening budget. The weak-model
rescue claim remains unmeasurable — now with stronger evidence that
the limitation is the task class, not the suite's difficulty tuning.**
No haiku ON cell was run (nothing to rescue); t14 was not built.

## 3. Interactive-PROXY S2-S6 probe: null again

The headless S2-S6 null does not cover interactive sessions, and a
true TTY session is not autonomously drivable. Closest drivable
analog: persistent two-turn `claude -p` sessions via
`--input-format stream-json` (follow-up turn sent only after the
first `result` event). Driver: `probe-interactive-s2s6.cjs`,
runner-identical isolation, doctrine ON, sonnet, n=3. Method label:
**interactive-PROXY** — programmatic multi-turn, non-TTY; this is not
a claim about human interactive sessions.

Result (raw: `20260610-220142-interactive-proxy-sonnet.json` + streams):

- S2-S6 spawns: **0 in 3/3 sessions.** Each session spawned exactly
  one default Explore recon subagent — the same topology as all 18
  headless t12 runs. Zero Planner / specialist / Staff-Engineer.
- Decision Gate verbalization: **0.** All three "Decision Gate"
  stream matches are `tool_result` events (the agent reading
  AGENTS.md), none are assistant text.
- Secondary observation: the follow-up turn regressed the turn-1
  contract in 2/3 sessions (orders.json rewritten as totals instead
  of raw records; CSV `2.50` vs `2.5`). Two-turn task pass was 1/3 —
  reported for completeness, not as an A/B cell (no OFF arm).

At n=9 headless (both modes) plus n=3 interactive-proxy, the finding
stands: **the multi-agent path S2-S6 has never fired in any measured
configuration.** Maestro's measured effects come from the universal
rules (S7-S10).

## 4. Markdown checker: live

`.markdownlint-cli2.jsonc` at repo root; run
`npx --yes markdownlint-cli2` from the repo root (no install
footprint). Scope: README.md, AGENTS.md, CLAUDE.md, docs/,
benchmarks/README.md; generated results, task fixtures, and `_*`
scratch are excluded. Six rules disabled as intentional house style
(MD013/MD022/MD032/MD033/MD041/MD060); baseline 327 findings reduced
to 5 real fixes (four untagged code fences, one by-design banner).
Documented in the root README Contributing section.

## Compliance updates (scorer re-run over new streams)

- t12 n=9/mode (18 streams): smoke_tested 18/18, surgical_scope
  18/18, no_oracle_tamper 18/18, claim_consistent 18/18,
  verification_ran 0/18 (fixtures ship no checker — expected),
  status_token 1/18 (one ON run stated UNVERIFIED). The frontier
  loop's "0/36 status tokens" is now 1 in 57 streams scored to date
  (36 frontier + 12 t12 top-up + 9 t13; proxy streams were scored for
  spawns/gate only, not the five compliance behaviors).
- t13 haiku OFF (9 streams): smoke 8/9, scope 9/9, tamper-free 9/9,
  claim_consistent 8/9, status_token 0/9.

## Run accounting

| Batch | Runs | Valid | Voids | Cost |
|---|---|---|---|---|
| t12 top-up (sonnet, 6/mode) | 12 | 12 | 0 | $5.1157 |
| t13 v1 haiku OFF probe | 3 | 3 | 0 | $0.5988 |
| t13 v2 haiku OFF probe | 3 | 3 | 0 | $0.6001 |
| t13 v3 haiku OFF probe | 3 | 3 | 0 | $0.6345 |
| interactive-proxy (sonnet) | 3 | 3 | 0 | $2.3270 |
| **Total** | **24** | **24** | **0** | **$9.2761** |

Budget ceiling $25.00; spent $9.28.
