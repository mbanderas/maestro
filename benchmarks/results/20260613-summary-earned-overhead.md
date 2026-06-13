# Earned-overhead metric + free re-score — 2026-06-13

Purpose: operationalize "spend only when it buys quality" as a measurable
denominator, and test for $0 (existing streams only, no new runs) whether
Maestro's overhead is *earned*. Plan was gated by a 3-panel adversarial
review that returned **3/3 FAIL**; every correction below comes from that
review. Status: **PENDING_REVIEW** (new harness tooling + a doctrine-facing
conclusion under S10).

## Tooling shipped

`benchmarks/aggregate.cjs` (+ `.test.cjs`, 23/23) — zero-dep, deterministic
aggregator over result-JSON rows, optionally joining stream behaviors from
`score-compliance.cjs`. Per (cli, model, task, mode) group it emits
(`cli` in the key so claude/codex/gemini cells are never pooled):

- `cost_per_verified_pass` = **median cost_usd of the passing runs** — NOT
  `total_cost / pass_count` (that charges the numerator with failed-run
  cost; kept separately as `total_cost_per_pass_ratio` for budgeting).
  Panel-1 correction.
- `cost_per_trusted_pass` = median cost of runs that pass AND clear the
  three **fair** trust signals: `claim_consistent`, `no_oracle_tamper`,
  `surgical_scope`. Null (not Infinity) when no trusted run exists.
- `status_token_count` reported **separately, never inside the trust
  denominator**: an OFF agent is never told the S7.3 token vocabulary, so
  scoring it on that token measures lexicon knowledge, not discipline.
  Panel-3 correction.

Join is by `stream_file` (batch-dir + filename), collision-proof when runs
from different batches/models are pooled. Falsifying check (in the test):
recomputes the hand-written `20260610-summary-frontier.md` medians exactly
(t12 sonnet OFF $0.3433, ON $0.3576).

## Validity boundary (Panel 2)

Within-model only; per-cell, never pooled across tasks; voids excluded
(is_error / 1-turn / $0); all batches post-`8a525bf` (hidden oracle).
Doctrine note: t12 ON = pre-kernel doctrine; t08 ON = `f8dc9b7` single
version (the `20260611-000015` top-up). n is small (3-9); **no cell reaches
significance — counts are descriptive only, no directional claim.**

## Results — sonnet (valid OFF-vs-ON cells)

| task | mode | n | pass | med_cost | cost/verified_pass | trusted_n | cost/trusted_pass | status_tok |
|---|---|---|---|---|---|---|---|---|
| t08 | off | 6 | 6/6 | $0.2294 | $0.2294 | 0/6 | -- | 0/6 |
| t08 | on | 6 | 6/6 | $0.2546 | $0.2546 | 2/6 | $0.2585 | 2/6 |
| t12 | off | 9 | 9/9 | $0.3433 | $0.3433 | 9/9 | $0.3433 | 0/9 |
| t12 | on | 9 | 9/9 | $0.4753 | $0.4753 | 9/9 | $0.4753 | 1/9 |

## Results — haiku (valid OFF-vs-ON cells)

| task | mode | n | pass | med_cost | cost/verified_pass | trusted_n | cost/trusted_pass |
|---|---|---|---|---|---|---|---|
| t07 | off/on | 3 | 3/3 | $0.0922 / $0.0978 | same | 3/3 / 3/3 | $0.0922 / $0.0978 |
| t08 | off/on | 3 | 3/3 | $0.0769 / $0.1797 | same | 0/3 / 1/3 | -- / $0.1114 |
| t09 | off/on | 3 | 3/3 | $0.1801 / $0.1630 | same | 2/3 / 1/3 | $0.1930 / $0.1999 |
| t10 | off/on | 3 | 3/3 | $0.0821 / $0.0823 | same | 1/3 / 2/3 | $0.0865 / $0.0876 |
| t11 | off/on | 3 | 3/3 | $0.2411 / $0.3398 | same | 3/3 / 3/3 | $0.2411 / $0.3398 |

(status_token 0 in every haiku cell, both modes — omitted.)

## Reading (honest)

1. **`cost_per_verified_pass` is degenerate at ceiling.** Every cell passes
   100% in both modes, so the metric equals median cost. On this denominator
   Maestro is **uniformly equal-or-more-expensive** — ON ≥ OFF in every cell
   (t12 +38%, t08 sonnet +11%, haiku t08 +134%, t11 +41%; ties on t07/t10;
   t09 −9%). There is **no pass headroom**, so Codex's headline metric cannot
   favor Maestro here, by construction.

2. **The trust axis does not rescue it.** `status_token` is tautological
   (OFF 0/everywhere) and excluded. Of the fair signals, `surgical_scope`
   and `no_oracle_tamper` are at ceiling in BOTH modes across all cells —
   the fixtures give the OFF baseline no temptation to drift scope or hunt
   the oracle, so there is nothing to catch. The **only** fair-signal gap in
   the corpus is `claim_consistent` on the checker-less **t08** refactor:
   OFF over-claims completion on 6/6 (haiku 3/3) runs with neither checker
   nor smoke run; ON on 4/6 (haiku 2/3). Same direction both models — but
   the gap is 2 runs at n=6, far below the noise floor, and it **reverses**
   on t09 (haiku OFF 2/3 trusted vs ON 1/3). Noise.

3. **Conclusion (confirms the panel).** The existing corpus **cannot**
   demonstrate earned overhead. On capability-ceilinged, docs-complete,
   single-shot fixtures the doctrine has nothing to rescue (pass) and little
   to restrain (scope/oracle already clean). The single honest lead is the
   honesty axis on **checker-less** tasks, where OFF measurably over-claims.
   A fair test needs a Phase-3 fixture purpose-built with temptation:
   **no checker available, a non-obvious correctness property, and a
   plausible wrong shortcut** that tempts a false "done" — scored on
   `claim_consistent` (fair), not `status_token`. The t08 result specifies
   that shape.

## Reproduction

```bash
node benchmarks/aggregate.test.cjs   # 23/23, incl. falsifying check
# sonnet cells, trust axis joined:
node benchmarks/aggregate.cjs \
  benchmarks/results/20260610-202033-claude-sonnet.json \
  benchmarks/results/20260610-213829-claude-sonnet.json \
  benchmarks/results/20260611-000015-claude-sonnet.json \
  --streams benchmarks/results/streams/20260610-202033-claude-sonnet \
  --streams benchmarks/results/streams/20260610-213829-claude-sonnet \
  --streams benchmarks/results/streams/20260611-000015-claude-sonnet --md
```

## Rollback

Delete `benchmarks/aggregate.cjs`, `benchmarks/aggregate.test.cjs`, this
summary, and revert the `INDEX.md` line. Scorer, runner, fixtures, doctrine
untouched.
