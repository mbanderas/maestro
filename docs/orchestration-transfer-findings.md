# Orchestration Transfer Findings — Multi-Agent / Discipline Layer

Date: 2026-06-22. Source: a single-vendor frontier-lab orchestrator technical report
(2026, ~31pp). Grade: **TR** single-vendor technical report — conceptual/architectural
transfer only. No numerics imported (repo 2-source rule untouched; nothing here is a
measured claim about Maestro).

## What the source system is, and why most of it doesn't transfer

The source system is a *learned orchestrator model*: a backbone LM with a lightweight
selection head, trained (SFT on soft worker-performance distributions → sep-CMA-ES → GRPO)
to route/compose a pool of frontier workers (Opus 4.8, GPT-5.5, Gemini 3.1). Two variants —
a *single-step* variant picks one worker per turn (latency-parity with a single model call);
an *agentic-workflow* variant emits up to 5-step workflows (subtask + assigned worker +
access list) and trades latency for quality.

Maestro is the inverse object: a **prompt-discipline layer over a fixed harness**, not a
trainable router. So the *training methods* (singular-value fine-tuning, soft-distribution
KL-SFT, sep-CMA-ES, GRPO, the logit selection head) are **not transferable** — we cannot
train anything. What *is* transferable is the set of **behavioral patterns those methods
converged on**, which the report describes in plain enough terms to encode as doctrine. The
whole value of this paper to us is: *a frontier lab measured which orchestration behaviors
pay, and we can adopt the behaviors directly without the training.*

---

## Transferable principles → Maestro deltas

| # | Principle | Maestro target | Proposed delta | Strength |
|---|-----------|----------------|----------------|----------|
| F1 | **Orchestration collapse** — if an agent sees a prior agent's *full trajectory*, it gets anchored onto that path → redundant contributions. Fix: each agent sees only its own transcript + an explicit **access list** of declared prior outputs. | S2–S6 manifests, S7.4, cross-talk check | Specialists in one group **never receive each other's reasoning trajectory** — only declared `OUTPUT` artifacts, via an explicit access list in the manifest. Reframe the "no extra context" rule: its purpose is *anti-anchoring*, not only token economy. | **High** |
| F2 | **No fixed aggregator** — systems with a static final synthesizer bottleneck on tasks outside that model's expertise. The report picks the aggregator *per task* (one model's head for trivia, another's for math). | S2–S6 synthesis step; S1 | Split two roles Maestro currently conflates: the **verification gate** (Staff Engineer PASS/FAIL — keep fixed, domain-agnostic) vs. a **synthesis/aggregation** step that merges parallel specialist outputs — assign *that* to the specialist whose domain matches the task crux, not a fixed seat. | **High** |
| F3 | **Per-step adaptive re-routing** — model choice is re-decided each turn, including *mid-task alternation* at critical junctures (build→debug, merge-conflict, dead-end). | S9 model routing; Frontier engine | Routing is **not locked at the S1 gate**. Re-evaluate tier/model at phase boundaries and at named critical junctures. The build/debug alternation is the canonical trigger. Highest-value for the Frontier multi-CLI engine. | **High** |
| F4 | **Topology by task type** — tree (independent leaves → task-matched aggregator) for knowledge-intensive/ambiguous problems; sequential builder↔skeptic alternation for coding. | S1 verdict; S2–S6 | S1 emits a coarse **topology hint**: knowledge-heavy/ambiguous → parallel independent attempts + matched synthesis (best-of-N / tree); build-debug coding → sequential alternation. Complements existing panels-of-3. | Medium |
| F5 | **Isolate-within / share-across** — isolate agents *inside* a workflow (prevent collapse, F1), but share memory *across* turns/workflows so agents don't re-discover the same artifacts with redundant tool calls. | S10 checkpoint; S7.2 | State the split explicitly: **durable findings/artifacts cross phase boundaries (checkpoint); live reasoning trajectories do not.** The report supplies the failure mode for the shared side: redundant re-discovery. | Medium |
| F6 | **Clean-slate re-examination by a different perspective** — when the lead agent dead-ends, a *fresh* agent re-examines from scratch and reframes (one model dead-ends server-side on an OTP bug; another, clean slate, finds it's a client-side concurrency bug). | S7.3 two-attempt rule | Extend "after 2 failed attempts, change approach" to "change the **perspective/agent**" — escalate a dead-end to a fresh agent with a clean-slate reframing brief, not just a retry by the same one. | Medium |

---

## The three highest-value deltas, in detail

### F1 — "Orchestration collapse" sharpens the manifest rule

This is the most useful single idea in the paper for us. Maestro already mandates scoped
manifests ("FILES, OUTPUT, ACCEPT, scoped TOOLS; no extra context") and justifies it on
token-economy / scope grounds (S7.4, S8). The report gives a **second, stronger rationale**:
feeding a specialist the *full reasoning history* of a prior specialist doesn't just waste
tokens — it **collapses the second agent's solution space onto the first's path**, producing
redundant work and killing the diversity that is the entire point of fanning out.

The concrete encoding the report uses is an **access list**: each workflow step names exactly
which prior *outputs* (not transcripts) enter the next agent's context. That's a tighter
contract than "no extra context." Doctrine delta for S2–S6 / the cross-talk check: a
specialist's manifest should carry an explicit access list of upstream **declared outputs**,
and the cross-talk check should verify no specialist was handed another's working trajectory.

### F2 — Adaptive aggregator vs. fixed Staff Engineer

The report's sharpest critique of prior multi-agent systems (it names Mixture-of-Agents and
OpenRouter Fusion) is that a **fixed final synthesizer is a ceiling**: the system can't beat
its aggregator on tasks outside the aggregator's expertise. The evidence is a tree example
(one model as aggregator synthesizes two partially-correct leaves on a trivia task) vs. a
math example (a different model as aggregator re-derives the crux) — *same tree shape,
aggregator swapped to fit the domain.*

Maestro's "Staff Engineer last returns PASS/FAIL" is fine **as a verification gate** — that
role is domain-agnostic (does it pass the checks). The trap is using one fixed seat to also
**synthesize/merge** parallel specialist outputs into the answer. Delta: separate the gate
(keep fixed) from synthesis (make task-matched). Where Maestro merges N parallel outputs, the
merging role should go to the specialist whose domain owns the crux.

### F3 — Routing is per-step, not per-task

The report's standout empirical result: even the *single-model-per-turn* variant beats SOTA
on Terminal Bench by **alternating** GPT-5.5 (builder) and Opus-4.8 (debugger) *within one
task*, swapping the debugger in at "particular, critical debugging points." Maestro's S9 picks
a tier once, at the gate, for the task. Delta: routing decisions recur at phase boundaries and
at named junctures (a failing check, a merge conflict, a dead-end → F6). This is most
actionable for the **Frontier local multi-CLI engine**, which already has multiple models on
tap; it is the component closest to being an actual learned-router-style component.

---

## Reinforcements — paper validates existing doctrine (no change needed)

- **Scoped, context-minimal manifests** (S2–S6, S7.4): the report's whole isolation design is
  this rule, independently arrived at. Keep, with the F1 rationale added.
- **Bias toward minimal orchestration** (S1, S9): the report's fast variant deliberately
  *removed* role assignment to shrink the coordination space and cut latency ("decision-only
  parametrization"). Mirrors S1's "frontier-class orchestrators bias single-agent harder —
  only parallelism, context isolation, or adversarial review justify multi-agent."
- **Verification = does it actually run** (S7.3): the Rubik's-cube experiment — two of three
  frontier baselines shipped solvers that *crashed before solving a single cube*; the source
  system's edge was producing code that runs. Direct validation of S7.3's "checks must pass,
  no exceptions."
- **Adversarial pairing** (S1 multi-agent trigger, S7.5): the report's "build and debug" =
  builder produces, skeptic *enumerates concrete risks* and relays them back. Maestro already
  treats adversarial review as a first-class trigger; the paper confirms it as a top win.

---

## Not transferable (training artifacts) — stated for honesty

- Singular-value fine-tuning of the backbone; the lightweight logit selection head.
- Soft-target KL supervised fine-tuning over worker-performance distributions.
- sep-CMA-ES evolutionary refinement; GRPO reinforcement learning on end-to-end reward.

All of these *produce* a router by training. Maestro has no training loop and a fixed model
per session — we can only encode the **resulting behaviors** as doctrine (F1–F6 above).

### Caution: capability-affinity priors

The source routing rests on a learned **domain→model affinity** map (one model for math,
another for niche recall, another for debugging/security). Tempting to hardcode an equivalent
for the Frontier engine. **Risk:** these priors rot at every model release — a static table
baked into doctrine prose becomes wrong silently. If adopted at all, keep it as a **small,
dated, easily-editable table** in the Frontier config, never in S-layer prose, and treat it as
a hint, not a rule.

---

## Recommendation (prioritized)

1. **Adopt F1 now** — cheapest, highest-leverage: add the access-list framing + anti-collapse
   rationale to the S2–S6 manifest spec and the cross-talk check. Pure doctrine edit.
2. **Adopt F2 now** — separate "verification gate" (fixed) from "synthesis" (task-matched) in
   the protocol. Pure doctrine edit.
3. **Adopt F3/F6 in the Frontier engine** — per-step re-routing + dead-end → fresh-perspective
   escalation. This is where Maestro actually has multiple models, so the payoff is real;
   needs an engine change, not just doctrine.
4. **Consider F4/F5** — topology hint at S1 and the isolate-within/share-across split at
   S10/S7.2 are clarifications of things Maestro half-says already; fold in when next editing
   those sections.
5. **Do not** attempt to import any training method or a hardcoded capability table into the
   S-layer.
