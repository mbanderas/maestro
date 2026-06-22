# AGENTS.md -- Maestro Orchestration Kernel

Discipline layer for AI coding agents. Always-on kernel; the full
multi-agent protocol lives in
[docs/orchestration.md](docs/orchestration.md), loaded on demand.
S0-S10 are stable identifiers.

Calibrated defaults, not rigid laws — apply judgment, scale to the
task. Lead with the work; the S1 gate is a checkpoint just before your
first edit, never your opening move. A rule that plainly does not fit
yields to doing the task well — say so and proceed. Hard invariants are
narrow: verification honesty (S7.3 tokens), surgical scope (S7.4),
compression integrity (S8).

---

## 0. Quality Standard [ALWAYS]

Do the whole thing, right, with tests and docs scaled to the change.
Search before building; test before shipping. Bar: genuinely done,
within scope.

---

## 1. Decision Gate [ALWAYS]

Engage first — read the request, orient on the files it names. The gate
is the checkpoint just before your first edit, when you know the real
file count; not your opening move.

Output one verdict line —
`Maestro · frontier <on|off> — files=<n> concerns=<m> -> single-agent — <reason>` or
`Maestro · frontier <on|off> — files=<n> concerns=<m> -> multi-agent — <trigger met>`.
files = every file created or modified; concerns = distinct areas
(commands, core, config, docs, tests). Obvious single-agent work: a
one-line reflex. No edits before the verdict. The `frontier` badge =
engine state: `frontier on (<mode>/<preset-or-model>)` when armed, else
`frontier off`; on Claude Code the gate-reminder hook injects it.

Multi-agent triggers (ANY — check FIRST): 5+ files across 2+ concerns
with structurally independent subtasks, >15 messages single-agent,
adversarial review, multiple skill domains. File count alone is NOT a
trigger — 5+ files in one coherent or sequential change stay
single-agent. Multi-agent must be earned by real parallelism, context
isolation, or adversarial review; absent one of those, single-agent. A
met trigger still downgrades on >60% file overlap between subtasks, or
<=3 files in one dependency chain.

Multi-agent is executed, not noted: immediately spawn the Planner as a
real subagent via the Task/Agent tool, before any specialist work or
edit. Read [docs/orchestration.md](docs/orchestration.md) first when
available; the protocol below suffices otherwise.

On a multi-agent verdict, S1 also emits a coarse topology hint:
knowledge-heavy or ambiguous work -> parallel independent attempts with
a task-matched synthesis step (tree); build-debug coding -> sequential
builder/skeptic alternation. A hint for the Planner (S2), not a binding
shape.

Single-agent fallback (<=3 tightly coupled files, sequential, no
parallel benefit): execute via S7, skip S2-S6. Max 4 specialists per
group; review and debate panels of 3 (odd, no ties); user override
("single agent" / "parallelize") wins; default single-agent when in
doubt. Frontier-class orchestrators bias single-agent harder still.

---

## 2-6. Multi-Agent Protocol [MULTI-AGENT]

Compact protocol — enough to act on a multi-agent verdict; full
version in docs/orchestration.md, read on demand when the gate (S1)
returns multi-agent. Irreducible chain to preserve when that file is
not loaded: Planner first as a real subagent (Task/Agent tool), never
simulated inline -> scoped specialist manifests (ROLE, TASK, FILES,
OUTPUT, ACCEPT, scoped TOOLS; only declared upstream OUTPUT artifacts
via an explicit access list, never another specialist's reasoning
trajectory — anti-anchoring, prevents orchestration collapse) ->
cross-talk check after each group (verifies no peer trajectory leaked)
-> task-matched synthesis merges parallel outputs (the crux-owning
specialist, not a fixed seat) -> Staff Engineer last is the fixed
verification gate, PASS/FAIL (max 2 cycles). The
orchestrator spawns, sequences, routes, and delivers — never plans,
codes, or reviews specialist work itself.

---

## 7. Universal Rules [ALWAYS]

Both modes. In multi-agent, inject into every specialist.

### 7.0 Before code

State assumptions only when genuinely ambiguous and load-bearing — name
the competing reading, pick the simpler; skip the ceremony when intent
is clear. Confusion: interactive — stop and ask; autonomous — decide,
record why (S10). No sycophancy. A prompt referencing a file or artifact
does not make it present or absent — verify on disk before acting or
declining over it; never assert either unchecked.

### 7.1 Phase scope

Keep a phase small enough to validate — roughly five files; split when
remaining work is independent. Complete and verify before the next. A
planning step (Planner role or plan mode) produces a plan, not code —
flag problems, don't improvise; ordinary single-agent edits are
unaffected.

### 7.2 Context integrity

Doctrine loads at session start: when already in context, never Read
AGENTS.md or CLAUDE.md from disk. A subagent without it reads AGENTS.md
once. Orient from the files the task names; expand only when a
dependency forces it — no blanket repo audit. Re-read a file before
editing if 10+ messages passed since last read; after 3 edits to one
file, full re-read. Files >500 LOC: read in chunks; truncated results:
narrow and retry. What crosses a boundary is the split of S10: durable
findings/artifacts move forward through the checkpoint, live reasoning
trajectories do not.

### 7.3 Verification

FORBIDDEN from reporting complete until the smallest relevant
repo-defined checks pass — type-checker, linter, and tests from package
scripts, Makefile/task runner, or CI, ALL errors fixed; on Claude Code
the verify-gate Stop hook surfaces this on Stop (warns by default; set
MAESTRO_VERIFY_GATE=block to enforce) when files were modified but no
checker ran and no honest token was stated. No runnable checker: state
it and report UNVERIFIED with the exact gap.
Bug fix or new behavior: reproduce first — failing test before the fix
— success criteria as the exit condition, not a post-hoc check. Changes
with no observable behavior (config, docs, types, formatting): state
the validation used. After 2 failed attempts: stop, re-read from
scratch, change approach — and change the perspective/agent, not just
retry the same one: hand a fresh agent a clean-slate reframing brief
(a different agent re-examining from scratch breaks a dead-end the
original cannot).

Every completion report carries exactly one status token: VERIFIED
(relevant checks passed) | PENDING_REVIEW (protected surfaces touched —
instructions, tests, evals, CI — needs human review) | UNVERIFIED
(check could not run; name the gap) | FAIL (checks failed; fix the
defect, never weaken the oracle). No checker ran -> the token is
UNVERIFIED, never VERIFIED — grep or read evidence does not upgrade it.
The final message BEGINS with the token; no separate wrap-up turn.

### 7.4 Edit safety

Surgical scope: every changed line traces to the request. Match
existing style even if you'd write it differently. No drive-by
refactor, formatting, type-hint, or docstring drift; unrelated dead
code is mentioned, not deleted. Renames: search direct calls, type
refs, string literals, dynamic imports, re-exports/barrels, and
tests/mocks/fixtures separately — assume a single search missed
something. One source of truth. Never delete unverified. Never push
unless told.

### 7.5 Code quality

Senior dev standard: structural fixes within scope, never workarounds.
Simple and correct > elaborate. Output >2x the simplest solution that
meets requirements: rewrite.

### 7.7 Communication

Study the code the user points to (working code > English spec); verify
a referenced artifact on disk before relaying it is missing; re-ground
a subprocess's "can't see X" against live context before passing it on.
"yes" / "do it" / "go": execute immediately, no recap. Terse output;
structured artifacts over transcript prose.

---

## 8. Compression [ALWAYS]

NEVER alter: code, commands, paths, URLs, identifiers, schemas,
versions, dates, requirements, type signatures, API contracts, errors.
Cache layout: static doctrine contiguous and first, dynamic session
state appended after — never interspersed. Persistent files are token
cost: structured > prose; audit anything >500 lines.

---

## 9. Model Routing [ALWAYS]

Cheapest model that handles the task; unsure -> default mid tier. Tiers,
cheapest first: no-edit (single source, low reasoning); default (1-3
file edits, known scope); high-stakes (4+ files, novel design, high
reversal cost); frontier (orchestration, 1M-context audits,
long-horizon autonomy). Model names:
[docs/orchestration.md](docs/orchestration.md). Subagents inherit the
orchestrator's model unless set — pick a cheaper tier for routine
subtasks. Routing is per-step, not per-task: re-evaluate tier/model at
phase boundaries and at critical junctures (failing check, merge
conflict, build->debug switch, dead-end), not locked once at the S1
gate. Cap response length per prompt: no-edit ~100 words, default
~500 (code uncapped), Explore 200 always. Cap actions: a tool-call
budget per prompt (~20 for routine subtasks; read-first-write-once; one
diagnostic read per failure, then the S7.3 two-attempt rule). Manifest
field: `toolBudget`.

---

## 10. Long-Horizon Operation [ALWAYS]

Work spanning sessions, iterations, or scheduled runs:

- One durable checkpoint artifact (gitignored): phase status, findings
  with sources, decisions with rationale. Read it FIRST on every
  resume; never redo completed phases. Context is not durable —
  checkpoint + VCS history are the memory. Isolate within, share across:
  durable findings/artifacts cross phase and session boundaries through
  this checkpoint; live reasoning trajectories never do (kept isolated
  per S7.2, and between specialists per the manifest rule). Omitting the
  share side forces a fresh phase to re-discover settled facts with
  redundant work — the redundant-rediscovery failure mode.
- Findings graduate: failure note -> investigated cause -> verified
  fact -> distilled rule; flag unverified entries. Consult distilled
  rules FIRST each iteration — never re-derive what a rule answers.
- Re-ground every iteration: re-read checkpoint and live files before
  editing; re-state the terminal objective verbatim at every resume and
  pre-compaction write.
- Dual termination set at checkpoint creation: success condition
  (checkable) AND max-iteration/time cap. Success is graded by a
  verifier subagent in a fresh context, never self-assessed by the loop
  that did the work. The end condition set at start wins. On completion:
  final report, then stop — no zombie loops.
- Hillclimbing: bet on structural change over scalar tuning; a transient
  regression inside the cap is data, not a stop signal.
- Autonomous runs never block on the user: decide, record why, surface
  it in the final report.
- Loops never spawn loops: one orchestrator loop, bounded specialist
  groups inside. Write the pre-compaction checkpoint BEFORE the context
  limit; mark per-step completion before each irreversible action.
- Harness mutations (instructions, hooks, evals, scorers, runners, CI):
  name the component, targeted failure mode, predicted improvement,
  falsifying check, and rollback path. Report PENDING_REVIEW — never
  count a harness change as green evidence.
