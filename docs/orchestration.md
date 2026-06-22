# Maestro Multi-Agent Orchestration: Full Protocol (S2-S6)

Loaded on demand: read this file when the Decision Gate
([AGENTS.md](../AGENTS.md) S1) returns a multi-agent verdict. The
kernel's compact protocol is a subset of this document and suffices
when this file is unavailable. Relocated verbatim from the always-on
doctrine in v1.2, content here extends the kernel, never overrides
it.

---

## Gate constraints (S1 detail)

- Max 4 specialists per group.
- >60% shared files or <=3 files in one chain: single-agent.
- Overlapping ownership erases parallelism; high-centrality: bias
  single.
- Specialists must differ in role or context, not split identical
  work, homogeneous splits underperform one agent with the same
  budget. Split-design rule for the Planner, not a gate downgrade.
- Parallelizability first: specialization pays only when subtasks are
  structurally independent. Coupled subtasks: single-agent wins at
  equal token budget, gains that ignore total compute don't count.
- Adversarial review is the best-evidenced multi-agent win. Review
  and debate panels: 3 specialists (odd, no ties); 4 stays the cap
  for parallel workstreams.
- How to split (and whether a split is too homogeneous) is the
  Planner's call (S2), made after the spawn, never the gate's.
- Topology hint (S1): knowledge-heavy / ambiguous -> parallel
  independent attempts feeding a task-matched synthesis (tree shape,
  best-of-N); build-debug coding -> sequential builder/skeptic
  alternation. Coarse hint for the Planner's split, not binding;
  complements the panels-of-3.

---

## 2. Planner [MULTI-AGENT]

First sub-agent, created by calling the Task/Agent tool, never
simulated inline by the orchestrator. No specialist work before
Planner returns.

Produces: subtasks with boundaries, dependency map, parallel groups
(max 4), per-task file scope + objective + acceptance criteria, flags
for single-agent subtasks and high-risk items, cross-talk pairs,
token-cost assessment (flag >60% overlap), task-class match.

Fewer broader > many narrow. Flag ambiguity, don't assume.

Reading: recommends single-agent -> switch. Ambiguities -> surface.

Task classes: Feature (spec/implement/test/integrate),
Bug (reproduce/root-cause/fix/regress),
Refactor (scope/refactor/test/verify),
Audit (discover/analyze/consolidate), Docs+code (change/update/check).

---

## 3. Specialists [MULTI-AGENT]

Manifest fields: ROLE, TASK, FILES (read/modify), UPSTREAM,
ORIENTATION, ASSUMPTIONS, OUTPUT, ACCEPT, TOOLS (scoped), RULES (S7
injected). ROLE = procedural workflow (step sequence + acceptance
criteria), never a bare job title, identity labels alone don't
change behavior.

A specialist receives only declared upstream OUTPUT artifacts — listed
explicitly in UPSTREAM as an access list — never another specialist's
reasoning trajectory, working transcript, or full plan. This is
anti-anchoring, not only token economy: handed a prior agent's full
trajectory, the next agent's solution space collapses onto that path
(orchestration collapse) — redundant work that kills the diversity
fanning out exists to create. No conversation history, other tasks, or
unrelated context. Isolation is the advantage. Out of scope: report and
stop.

---

## 4. Cross-Talk [MULTI-AGENT]

After each group: check if A modified B's files, changed B's
interfaces, invalidated B's assumptions, or produced B's inputs; and
verify no specialist was handed another's working trajectory — only
declared OUTPUT artifacts may cross between peers (anti-collapse).

Route minimum context from A to B. If B completed, spawn correction
agent. Orchestrator: spawn, sequence, detect, route, deliver. Never
plan, code, review, or do specialist work.

---

## 5. Staff Engineer [MULTI-AGENT]

Final sub-agent, and the fixed **verification gate**: domain-agnostic
PASS/FAIL on the integrated output (does it meet requirements + checks)
— not the synthesizer. This seat stays fixed because verification is
domain-agnostic.

Synthesis/aggregation — merging parallel specialist outputs into the
delivered answer — is a SEPARATE role, assigned to the specialist whose
domain owns the task crux, never pinned to the gate's fixed seat: a
fixed aggregator ceilings quality on tasks outside its expertise
(fixed-aggregator bottleneck).

Packet: changed files + diffs, objective, decisions, risks,
questions. Expand for: core architecture, security, central
abstractions.

Check: requirements met, specialist contradictions, cross-breakage
(interfaces/imports/types/state), architectural drift, verification
(S7.3), dead code/orphaned imports/incomplete renames,
surgical-scope violations (S7.4).

Returns PASS or FAIL (issues + owner + fix). Max 2 cycles, then
deliver with issues listed.

High-risk or contested verdicts: adversarial panel of 3 (odd, no
ties), each prompted to refute, not confirm.

---

## 6. Orchestrator Discipline [MULTI-AGENT]

- Route minimum viable info (signature, not 200-line diff)
- Checkpoint before spawns/handoffs/resumes: objective, files,
  requirements, decisions, risks, next action
- Structured artifacts > transcript carryover
- Stable scaffolds for cache reuse; no per-specialist rephrasing
- Track agent status; report blocks immediately
- Resume from latest artifact, not full history
- Specialist fails: report, ask user. No silent retry >1
- Deliver what asked. No gold-plating. Hooks > prompt reminders

---

## 9. Model Routing: full table

Pick the cheapest model that handles the task. Orchestrator decides
at spawn time; Planner (S2) assigns per subtask. Routing is per-step,
not locked per-task: re-evaluate at phase boundaries and named critical
junctures (failing check, merge conflict, build->debug, dead-end -> S7.3).

| Tier | When | Examples |
|------|------|----------|
| Haiku | No edits, single source, low reasoning | Status lookup, chat, format, classify, extract |
| **Sonnet** | 1-3 file edits, known scope. **Default** | Bug fix, refactor, test, review, docs |
| Opus | 4+ files, novel design, high reversal cost | Architecture, security review, complex debug |
| Frontier (Fable-class) | Orchestrator tier: long-horizon autonomous work, 1M-context audits, frontier reasoning | Orchestration, system design, deep multi-file debug, adversarial synthesis |

When unsure: Sonnet.

### Output caps

Agent prompts MUST specify max response length. Oversized results
bloat parent context and trigger compaction.

| Agent tier | Cap | Exception |
|------------|-----|-----------|
| Haiku | 100 words | - |
| Sonnet | 500 words | Code output (uncapped) |
| Opus | Uncapped | - |
| Frontier | Uncapped | - |
| Explore | 200 words | Always, regardless of model |

Explore agents: "report in under 200 words" in every prompt.

### Tool-call budgets

Action tokens are the third cost lever, beside output caps (above)
and S8 input compression. Every subagent prompt carries a tool-call
budget (manifest field `toolBudget`); idea adapted from
claude-token-efficient (MIT).

| Task type | Budget |
|-----------|--------|
| Routine subtask, known scope | ~20 calls |
| Read-only research / Explore | ~10 calls |
| Multi-file implementation | scale with file count; state it explicitly |

Discipline inside the budget: read-first-write-once (read each
needed file once, then edit, no re-read loops); one diagnostic read
per failure, then the S7.3 two-attempt rule applies (stop, re-read
from scratch, change approach). Budget exhausted: report progress
and the named gap, never burn calls polling.
Research agents returning raw dumps waste more tokens than they save.

---

## Self-evaluation (relocated S7.6)

- Two perspectives: perfectionist critique + pragmatist accept
- Bug autopsy: root cause vs symptom, prevention
- After 2 failures: stop, re-read from scratch, different approach
