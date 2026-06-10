# Research Sweep 2026 — Evidence Base for Doctrine v1.1

Date: 2026-06-10. Method: 4 parallel web-research tracks (multi-agent efficacy, loop
engineering, benchmark design, instruction overhead), live sources only, 2025-2026 window.
Evidence grades: **PR** peer-reviewed | **PP** preprint | **VD** vendor docs | **BL** blog/community.
Findings below are condensed; each delta lists its sources. Numerics change only on 2+
independent sources (repo promise).

---

## Track A — When multi-agent beats single-agent

| # | Claim | Source | Grade |
|---|-------|--------|-------|
| A1 | Under equal thinking-token budgets, single-agent matches/beats sequential multi-agent on multi-hop reasoning (MuSiQue 0.260 vs 0.229 @1k tokens). | Tran & Kiela, arXiv:2604.02460 (2026-04) | PP |
| A2 | Strong single-agent multi-turn baseline matches homogeneous multi-agent workflows (HumanEval 92.1 vs 91.6) at ~23% lower cost via KV-cache reuse. | Xu et al., arXiv:2601.12307 (2026-01) | PP |
| A3 | Role-differentiated teams improve 32.5%->53.5% scaling 2->5 agents; homogeneous teams degrade 34.5%->31.5% over same range. | AgentGroupChat-V2, arXiv:2506.15451 (2025-06) | PP |
| A4 | Task parallelizability (structural subtask independence) is the primary predictor of specialization payoff. | Mieczkowski et al., arXiv:2503.15703 (2025-09) | PP |
| A5 | Optimal debate/review group size is 3 (odd avoids ties); accuracy drops scaling 5->10. | Survey arXiv:2506.00066 (2026-06), aggregating Ju 2024, Zhang 2024 | PP |
| A6 | Expert procedural conditioning per role beats identity-label role prompting. | El Kandoussi, arXiv:2604.00026 (2026-04) | PP |
| A7 | Adversarial debate/critic pipelines show consistent correctness gains — best-evidenced multi-agent win condition. | OpenReview forum:06ZvHHBR0i (2025) | PR |
| A8 | Production anecdotes: coordination overhead ~37% of tokens; multi-agent wins only on large solution-space exploration (+1.65x output tokens). | iterathon.tech (2026) | BL |

No credible 2025-2026 vendor-controlled comparisons (Anthropic/OpenAI/Google) on SWE-bench-class
tasks were found — vendor blogs cite adoption, not controlled benchmarks.

## Track B — Loop engineering / long-horizon operation

| # | Claim | Source | Grade |
|---|-------|--------|-------|
| B1 | "Loop engineering" is a real named practitioner term in 2026 (attributed Boris Cherny/Anthropic, popularized Addy Osmani); informal, no academic formalization. | mindstudio.ai blog (2026-06-09) | BL |
| B2 | Goal drift is universal in long-horizon agents; correlates with context growth as early instructions fade. | Arike et al., arXiv:2505.02709 (2025-05) | PP |
| B3 | Primary drift mitigation: externalize goals to durable files + re-anchor goal verbatim at context boundaries. | zylos.ai (2026-04-03), citing arXiv:2505.02709, 2603.19685, 2602.16165 | BL+PP |
| B4 | Claude Code Routines (2026-04): cloud scheduled runs, min 1h cron; /loop in-session, ~7-day expiry. | code.claude.com/docs/en/routines | VD |
| B5 | Step-level durable execution (DBOS/LangGraph checkpointing) prevents duplicate irreversible actions on resume. | dbos.dev blog (2025-02-24) | VD/BL |
| B6 | Dual termination criteria (success AND max-iteration) + per-iteration tool budgets are established loop practice; vague goals are root cause of infinite loops. | mindstudio.ai (2026-06-09) | BL |
| B7 | Stateless-between-runs pattern (git history + progress files as memory, fresh context each run) avoids cumulative drift. | Saplin, dev.to (2026-03-30) | BL |
| B8 | Active pre-compaction (agent-initiated checkpoint before limit) beats reactive compaction; Anthropic compaction API reports 84% token reduction in 100-turn evals. | ai-boost/awesome-harness-engineering (2025-26) | BL |

Unverified secondary citation (flagged, not load-bearing): Anthropic "2026 Agentic Coding
Trends Report" claiming harness config swings benchmarks 5+ points — primary not fetched.

## Track C — Discriminating benchmark design

| # | Claim | Source | Grade |
|---|-------|--------|-------|
| C1 | Frontier agents: >70% on SWE-bench Verified but <25% on SWE-Bench Pro (multi-file, avg 107 LOC / 4.1 files, held-out repos) — gap driven by cross-file semantic complexity. | arXiv:2509.16941 (2025-11) | PP |
| C2 | Task difficulty emerges from interaction of problem statement, repo state, tests, and patch complexity — hidden invariants (tested properties not in spec) raise difficulty. | Agent Psychometrics, arXiv:2604.00594 (2026-04) | PP |
| C3 | Iterative self-extension with active regression tests collapses strict solve rates to 0.5% by final checkpoint (architectural erosion in 80% of trajectories). | SlopCodeBench, arXiv:2603.24755 (2026-03) | PP |
| C4 | Single-run pass@1 varies 2.2-6.0 pp even at temp 0; detecting a 2% effect needs n=9/cell (p<.05, 80% power); 1% needs n=36. | On Randomness in Agentic Evals, arXiv:2602.07150 (2026-02) | PP |
| C5 | Bayesian posterior mean + credible intervals beats pass@k at small n; declare differences only on non-overlapping intervals. | arXiv:2510.04265 (2025-10) | PP |
| C6 | Contamination is graded, not binary; fix is post-cutoff/synthetic task sources, date-stamped. | SWE-rebench, arXiv:2505.20411, NeurIPS 2025 D&B | PR |
| C7 | Visible ground-truth tests inflate resolution 20-60%; verify must be hidden from agent at task time. Pass rate negatively correlates with implementation size (15+ files). | FeatureBench, arXiv:2602.10975 (2026-02) | PP |
| C8 | Harness moves scores 10-20 pp at fixed weights — A/B conditions must differ ONLY in doctrine injection. | digitalapplied.com (2026) | BL |
| C9 | Hard SWE-bench-Verified tasks avg 2.0 files / 6.8 hunks; multi-file requirement is the primary discriminator. | jatinganhotra.dev (2025-04) | BL |

## Track D — Instruction overhead / compression

| # | Claim | Source | Grade |
|---|-------|--------|-------|
| D1 | Frontier models reliably follow ~150-200 simultaneous instructions; compliance decays within sessions for bloated files (claimed 95%->20-60% by msgs 6-10). | thomas-wiegold.com (2026, secondary) | BL |
| D2 | Anthropic official: "if your CLAUDE.md is too long, Claude ignores half of it"; use Skills for conditional domain knowledge. | code.claude.com/docs/en/best-practices | VD |
| D3 | Conflicting directives cause reasoning collapse (100%->0-30% in production case), independent of length; ordering conflicts force premature commitment. | arXiv:2603.13351 (2026) | PP |
| D4 | Judgment-intensive (semantic) rules degrade first under prompt density; structural rules are resilient. | arXiv:2603.13351 refs (2025) | PP |
| D5 | Empirical ruleset optimization converges on 20-50 rules for peak coding-agent accuracy. | arize.com (2025) | BL |
| D6 | Prompt caching: 13-31% TTFT, 41-80% cost reduction for large stable prompts; keep static doctrine contiguous, dynamic state appended last. | arXiv:2601.06007 (2025) | PP |
| D7 | Intent-gated dynamic prompt assembly (load only task-relevant rules) cuts tokens/latency without reported compliance loss. | arXiv:2601.11687 (2025) | PP |
| D8 | Auto-generated context files decreased success ~20% (ETH Zurich, 2026-02, primary unconfirmed); hand-curated only. | via thomas-wiegold.com | BL |

---

## Delta decisions

### Accepted for doctrine v1.1 (Phase 2)

| Delta | Sections | Sources (2+ required for numerics) |
|-------|----------|-----------------------------------|
| Add parallelizability check + token-budget-fairness note to Decision Gate | S1 | A4, A1 |
| Name adversarial review the best-evidenced multi-agent justification | S1, S5 | A7, A5 |
| Review/debate panels: 3 specialists (odd, no ties); 4 remains hard cap for parallel workstreams | S1, S5 | A5, A3 (2 sources — numeric refinement, cap unchanged) |
| ROLE manifest field: procedural workflow spec (steps + acceptance), not identity label | S3 | A6 (single source — worded as guidance, not numeric) |
| Goal re-anchor: re-state terminal objective verbatim at every resume/pre-compaction checkpoint write | S10 | B2, B3 |
| Dual termination: checkpoint must declare success condition AND max-iteration cap at creation | S10 | B6 + existing S10 hard-caps rule |
| Loop Engineering subsection: name the practice, map S10 primitives to it, bounded loops only (no loop-of-loops) | S10 | B1, B6, B7 |
| Cache-friendly layout note: static doctrine contiguous, session state appended after | S8 | D6 |

### Accepted for benchmark design (Phase 3)

| Delta | Sources |
|-------|---------|
| t09+: multi-file cross-dependency (4+ files) with HIDDEN invariants — verify checks properties not stated in spec | C1, C2, C9 |
| t10: iterative self-extension — 3 sequential feature checkpoints, regression tests active, verify runs all | C3 |
| Verify scripts must be invisible to agent during run (audit runner; copy fixture only, never verify.cjs) | C7 |
| Fixtures synthetic + date-stamped post-cutoff; no public-repo ports | C6 |
| Report pass@1 per cell with n; pessimistic pass^k alongside; no significance claims below n=9; effects <5pp labeled indistinguishable at n=3 | C4, C5 |
| A/B invariant stated as hard rule: identical harness, only doctrine injection differs | C8 |

### Deferred / rejected (WHY recorded)

| Delta | Verdict | Why |
|-------|---------|-----|
| Cut AGENTS.md to <=80 lines / 20-50 rules now | DEFER -> empirical test | Direction converges (D1, D2, D5) but strongest numbers are blog-grade. Action: build compact `AGENTS-core.md` variant and benchmark ON-full vs ON-core vs OFF on discriminating cells (Phase 3/4). Measure, then cut. |
| Conditional rule loading via Skills | DEFER | D2+D7 support it, but Claude-only mechanism; Maestro targets 3 CLIs. Revisit after ON-core results. |
| Step-level durable execution (DBOS-style) | REJECT for repo | Infrastructure pattern, violates zero-dep promise. Noted in S10 as external option only. |
| Raise specialist cap to 5 for role-differentiated teams (A3) | REJECT | Single source for >4 benefit; A5 shows decay past 5; existing cap 4 sits inside evidence band. |
| Bayesian credible intervals as primary stat | REJECT for now | n too small for stable posteriors to matter (C5's own 80-trial note); honest n-labels + pass^k suffice at our scale. |

## Conflict audit (D3-driven)

Known directive tensions to resolve as explicit conditionals in v1.1: clean-before-build vs
surgical scope (already conditioned on task class — verify wording); single-agent default vs
multi-agent triggers (make trigger list strictly exceptional); compression levels vs
never-alter list (no change — already conditional).
