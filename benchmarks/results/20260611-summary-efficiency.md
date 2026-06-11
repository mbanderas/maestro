# Token-efficiency loop summary — 2026-06-11

Overnight unattended loop on branch `feat/token-efficiency`. Objective:
reduce Maestro's measured token/cost overhead (+10% cost on t08, +38%
on t12, ON vs OFF, n=9 medians) while preserving the discipline
signals, and make a user's CLAUDE.md a one-line import. All cells
Claude Code CLI, sonnet, isolated `CLAUDE_CONFIG_DIR`, hidden oracle.
12 paid runs, 0 voids, $4.91 total. Status: **PENDING_REVIEW** (every
change below is a doctrine harness mutation under S10).

## What changed (commits `e4eb170`, `fd6cfeb`)

Always-on doctrine slimmed to a kernel; measured turn-tax mechanisms
attacked directly:

- `AGENTS.md` 13,989 -> 8,294 B; `CLAUDE.md` 2,353 -> 1,302 B
  (combined -41%). Five discipline signals kept verbatim-strength
  with stable section numbers: S1 counted gate verdict + spawn
  imperative, S7.3 status vocabulary + FORBIDDEN gate, S7.4 surgical
  scope, oracle integrity, S10 long-horizon.
- S2-S6 full protocol relocated verbatim to `docs/orchestration.md`
  (read on a multi-agent verdict); a ~10-line actionable mini-protocol
  stays inline so the verdict works on every runtime.
- New turn-tax rules from t12 stream forensics (ON runs spent +3
  turns on pre-work orientation — 8/9 re-read the doctrine from disk
  despite having it in context — and +2 on trailing ceremony):
  S7.2 "never Read AGENTS.md/CLAUDE.md when already in context",
  orientation-from-target-files, S7.3 "final message BEGINS with the
  status token, no separate wrap-up turn". Blanket post-edit re-read
  dropped (measured behavioral delta: zero at t12 n=9); conditional
  staleness re-reads kept.
- `.cursorrules` regenerated from the kernel (was drifted: predated
  the counted verdict); `docs/codex.md` budget updated; CHANGELOG
  migration note added. User-facing install story: an existing
  CLAUDE.md adds the single `@AGENTS.md` line.

## Measured verdict: NULL on cost and turns (pre-declared rule)

New-ON (this branch) vs committed old-ON n=9 baselines; OFF reused,
never re-run. Decision rule stated before the batch: claim only if
the median gap clearly exceeds within-mode spread.

| Cell | n | Pass | Med cost | Med turns | Med out-tok | Med wall ms |
|---|---|---|---|---|---|---|
| t08 old-ON | 9 | 9/9 | $0.2529 (rng 0.210-0.310) | 25 (24-34) | 4,411 | 59,310 |
| t08 new-ON | 6 | 6/6 | $0.2848 (rng 0.264-0.397) | 24.5 (24-35) | 4,753 | 86,658 |
| t12 old-ON | 9 | 9/9 | $0.4753 (rng 0.344-0.680) | 25 (20-27) | 6,882 | 143,050 |
| t12 new-ON | 6 | 6/6 | $0.4914 (rng 0.425-0.673) | 20.5 (17-25) | 8,519 | 202,873 |

- Cost: t08 +12.6% vs old-ON (gap $0.032 inside $0.100 spread), t12
  +3.4% (gap $0.016 inside $0.336 spread). **No improvement claim; no
  regression claim — null both cells.** Point estimates moved
  adversely; honesty requires saying so.
- Turns: t12 25 -> 20.5 — the predicted direction (orientation +
  ceremony cuts), median now below the OFF median (21) — but the gap
  (4.5) sits inside the within-mode spread (7). Null by rule;
  recorded as a residual worth an n=9 confirmation.
- Out-tokens t12 +24%: the one-turn close packs the report into
  fatter final messages — turn savings did not become cost savings.
  Mechanism note for any future attempt: capping final-message length
  is the untested complement.
- Static context tax is real but small: the -41% always-on bytes save
  ~310 cache-read-priced tokens/turn (~10% input price); at these
  task lengths that is cents, swamped by run-to-run noise. This
  replicates the CORE-variant null from the other direction.

## Discipline signals: 3 maintained, 1 strongly improved, 1 caveat

Scored with the committed `score-compliance.cjs` + `parse-spawns.cjs`
over all 12 new streams (dirs `20260611-031222`, `20260611-032459`):

| Signal | Old-ON baseline | New-ON |
|---|---|---|
| Gate verdict line (counted format) | 9/9 probes | **12/12** |
| Status token stated | t08 2/12, t12 1/18 | **12/12** |
| Surgical scope | 30/30 | 12/12 |
| Oracle tamper-free | 30/30 | 12/12 |
| claim_consistent | t08 10/12, t12 18/18 | t08 **1/6**, t12 6/6 |

- The first-line status close fixed the dead signal: 12/12 runs state
  a token (was 3/30 across old baselines).
- **Caveat, reported straight:** on t08 (fixture ships no checker),
  5/6 runs said VERIFIED on grep-only evidence; the scorer counts
  that claim-inconsistent. Under old doctrine runs simply stated no
  token at all (consistent-by-silence, 2/2 stated tokens were equally
  inconsistent). The salience fix surfaced latent overclaiming rather
  than creating it, but the per-run unsupported-VERIFIED rate did
  rise (2/12 -> 5/6 on t08). Proposed follow-up (not shipped
  tonight): one kernel line — "no checker ran: the token is
  UNVERIFIED, never VERIFIED."
- First S2-S6 activation ever measured: t12 r3 issued a multi-agent
  verdict and actually spawned a Planner subagent (0 spawns in all 57
  previously scored runs). 2/6 t12 runs verdicted multi-agent (r6 did
  not follow through — verdict-spawn gap noted). t08 downgrade
  verdicts still bend the closed downgrade set ("no parallel
  benefit", "single dependency chain" at 11 files) — same behavior as
  the activation-loop probes, unchanged by the slimming.

## Packaging objective: met structurally

A user's own CLAUDE.md needs exactly one line (`@AGENTS.md`); the
shipped CLAUDE.md is now a thin adapter; Codex headroom improves
(kernel is a quarter of the 32 KiB cap, was a third); `.cursorrules`
de-drifted. Plugin-skill packaging of the orchestration doc was
considered and deferred (pointer doc is portable to all runtimes;
skills are Claude-Code-only).

## Rejected alternatives

- **Hook-first prose replacement** (candidate C): hooks cannot fire
  under benchmark isolation, so the falsifying check can never credit
  it, and Codex/Gemini/Cursor have no hook system — moved content
  would vanish for them. Hooks stay as shipped interactive extras.
- **Aggressive byte-minimal kernel (~2 KB)**: the CORE-variant null
  plus the panel's discipline lens showed bytes are not the lever;
  cuts below ~8 KB start deleting signal wording with no measurable
  cost return.
- **Full S2-S6 removal from kernel**: refuted by the adversarial
  panel (stranded spawn imperative; non-Claude runtimes lose the path
  entirely). The inline mini-protocol is the compromise — and it
  produced the first measured Planner spawn.

## Adversarial panel record (phase 4)

Cache lens: SURVIVES (turn savings dominate static savings ~60:1;
demanded a reliable on-demand load mechanism). Discipline lens:
REFUTED as originally specified (stranded spawn imperative, re-read
cut overreach, status-token risk). Portability lens: REFUTED as
originally specified (blanket never-read line unsafe off-runtime,
prose pointer unreliable, .cursorrules drift, append-install
migration). All amendments adopted; two dissents overruled with
recorded rationale and falsifying checks (see `_token-efficiency.md`
checkpoint, phase 4).

## Reproduction

```powershell
# new-ON cells (this branch)
pwsh -NoProfile -File benchmarks/run-maestro-bench.ps1 -Task t08-refactor-error-convention -Mode on -Runs 6 -Model sonnet -SaveStream
pwsh -NoProfile -File benchmarks/run-maestro-bench.ps1 -Task t12-feat-export-subsystem -Mode on -Runs 6 -Model sonnet -MaxBudgetUsd 2.0 -SaveStream
# scoring
node benchmarks/score-compliance.cjs --dir benchmarks/results/streams/20260611-031222-claude-sonnet
node benchmarks/score-compliance.cjs --dir benchmarks/results/streams/20260611-032459-claude-sonnet
node benchmarks/parse-spawns.cjs --dir benchmarks/results/streams/20260611-031222-claude-sonnet
node benchmarks/parse-spawns.cjs --dir benchmarks/results/streams/20260611-032459-claude-sonnet
```

Old-ON/OFF baselines: raw files named in
`20260611-summary-activation.md` and `20260610-summary-followup.md`.

## Rollback

`git revert fd6cfeb e4eb170` on this branch (or delete the branch;
`main` is untouched). Hooks, fixtures, scorer, and runner are
unmodified by this loop.

## Run accounting

| Batch | Runs | Valid | Voids | Cost |
|---|---|---|---|---|
| t08 new-ON n=6 `20260611-031222` | 6 | 6 | 0 | $1.8064 |
| t12 new-ON n=6 `20260611-032459` | 6 | 6 | 0 | $3.1062 |
| **Total** | **12** | **12** | **0** | **$4.9126** |

Ceiling $15.00; spent $4.91.

## Draft README/website copy (NOT applied — morning review)

```diff
- <sub>13 fixture tasks &middot; 84 valid A/B runs &middot; 0 voids &middot; 5 hooks, all tested &middot; ~10 KB doctrine &middot; 2 files to install</sub>
+ <sub>13 fixture tasks &middot; 96 valid A/B runs &middot; 0 voids &middot; 5 hooks, all tested &middot; ~8 KB always-on kernel &middot; 2 files to install</sub>
```

```diff
- | `.cursorrules` | Cursor adapter | Full doctrine (Cursor does not support imports) |
+ | `.cursorrules` | Cursor adapter | Kernel copy (Cursor does not support imports); full S2-S6 in docs/orchestration.md |
```

```diff
- Maestro's doctrine is ~10 KB — roughly a third of the default 32 KiB cap
+ Maestro's always-on kernel is ~8 KB — a quarter of the default 32 KiB cap; the full multi-agent protocol loads on demand from docs/orchestration.md
```

Plus a candidate honesty line for the measured-cost section: "A
kernel rewrite (2026-06-11) cut always-on bytes 41% and fixed status
reporting (12/12 vs 3/30) with no measurable cost change — the
overhead is behavioral, not byte-weight."
