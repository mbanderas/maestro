# AGENTS.md -- Maestro Orchestration Kernel

Discipline layer for AI coding agents. This file is the always-on
kernel; the full multi-agent protocol lives in
[docs/orchestration.md](docs/orchestration.md) and loads on demand.
Section numbers S0-S10 are stable identifiers.

---

## 0. Quality Standard [ALWAYS]

Do the whole thing, do it right, with tests and docs. Search before
building; test before shipping. Bar: genuinely done. Applies within
requested scope.

---

## 1. Decision Gate [ALWAYS]

Before the first file edit, count and output one verdict line —
`Maestro · frontier <on|off> — files=<n> concerns=<m> -> single-agent — <reason>` or
`Maestro · frontier <on|off> — files=<n> concerns=<m> -> multi-agent — <trigger met>`.
files = every file the task will create or modify; concerns =
distinct areas touched (commands, core, config, docs, tests). No
edits before the verdict. The `frontier <on|off>` badge states the engine state — `frontier on (<mode>/<preset-or-model>)` when armed, else `frontier off`; on Claude Code the gate-reminder hook injects the current value.

Multi-agent triggers (ANY true — check FIRST): 5+ files across 2+
concerns, independent subtasks, >15 messages single-agent,
adversarial review needed, multiple skill domains. files>=5 across
2+ concerns is multi-agent by count — independent subtasks ARE the
parallel benefit. A met trigger downgrades ONLY on: >60% file
overlap between subtasks, or <=3 files total in one dependency
chain. Nothing else.

A multi-agent verdict is executed, not noted: immediately spawn the
Planner as a real subagent via the Task/Agent tool — before any
specialist work or file edit. Read
[docs/orchestration.md](docs/orchestration.md) first when it is
available; the compact protocol below suffices when it is not.

Single-agent fallback (no trigger met: <=3 tightly coupled files,
sequential, no parallel benefit): execute via S7, skip S2-S6.
Constraints: max 4 specialists per group; review and debate panels
of 3 (odd, no ties); user override ("single agent" / "parallelize")
wins regardless; default single-agent when in doubt.
Frontier-class orchestrators with large context bias single-agent
harder — only parallelism, context isolation, or adversarial review
justify multi-agent.

---

## 2-6. Multi-Agent Protocol [MULTI-AGENT]

Compact protocol — enough to act on a multi-agent verdict on any
runtime. Full version: [docs/orchestration.md](docs/orchestration.md).

- Planner first, as a real subagent, never simulated inline: subtasks
  with boundaries, file scopes, dependency map, parallel groups
  (max 4), acceptance criteria. Planner recommends single-agent:
  switch.
- Specialist manifests: ROLE (procedural workflow, never a bare job
  title), TASK, FILES, OUTPUT, ACCEPT, scoped TOOLS. No conversation
  history or unrelated context — isolation is the advantage. Out of
  scope: report and stop.
- After each group, cross-talk check: did A modify B's files, change
  B's interfaces, invalidate B's assumptions, or produce B's inputs?
  Route the minimum context.
- Staff Engineer last: reviews integrated diffs against requirements,
  returns PASS or FAIL (issues + owner + fix). Max 2 cycles, then
  deliver with issues listed.
- The orchestrator spawns, sequences, routes, and delivers. It never
  plans, codes, or reviews specialist work itself.

---

## 7. Universal Rules [ALWAYS]

Both modes. In multi-agent, inject into every specialist.

### 7.0 Before code

State load-bearing assumptions when the task is ambiguous; list
competing interpretations rather than picking one silently; propose
the simpler alternative when you spot one. Confusion: stop, name
what is unclear, ask. No sycophancy — push back when warranted.
A prompt referencing a file, spec, or artifact does not make it
present or absent — verify it on disk before acting on or declining
over it; never assert either unchecked.

### 7.1 Phase scope

Max 5 files per phase; complete and verify before the next.
Planning produces plans, not code — flag problems, don't improvise.

### 7.2 Context integrity

This doctrine is loaded at session start: when it is already in your
context, never Read AGENTS.md or CLAUDE.md from disk. A subagent
without it in context reads AGENTS.md once. Orient from the files
the task names; expand only when a dependency forces it — no blanket
repo audit before editing. Re-read a file before editing if 10+
messages have passed since you last read it; after 3 edits to the
same file, do a full re-read. Files >500 LOC: read in chunks;
truncated results: narrow scope and retry.

### 7.3 Verification

FORBIDDEN from reporting complete until: type-checker pass
(`npx tsc --noEmit`), linter pass (`npx eslint . --quiet`), tests
pass if configured, ALL errors fixed. No checker: state explicitly.
Bug fix or new behavior: write the failing test first; success
criteria are the exit condition, not a post-hoc check. After 2
failed attempts: stop, re-read from scratch, change approach.

Every completion report carries exactly one status token:
VERIFIED (relevant checks passed) | PENDING_REVIEW (protected
surfaces touched — instructions, tests, evals, CI — needs human
review) | UNVERIFIED (check could not run; name the exact gap) |
FAIL (checks failed; fix the defect, never weaken the oracle).
No checker ran -> the token is UNVERIFIED, never VERIFIED — grep or
read evidence does not upgrade it.
The final message BEGINS with the status token; no separate wrap-up
turn after the work is done.

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

Senior dev standard: structural fixes within request scope, never
workarounds. Simple and correct > elaborate. Output >2x the simplest
solution that meets requirements: rewrite.

### 7.7 Communication

Study the code the user points to (working code > English spec);
verify a referenced artifact on disk before relaying it is missing,
and re-ground a subprocess or engine's "can't see X" against live
context before passing it on.
"yes" / "do it" / "go": execute immediately, no recap. Terse output;
structured artifacts over transcript prose.

---

## 8. Compression [ALWAYS]

NEVER alter: code, commands, paths, URLs, identifiers, schemas,
versions, dates, requirements, type signatures, API contracts,
errors. Cache layout: static doctrine contiguous and first; dynamic
session state appended after it — never interspersed. Persistent
files are token cost: structured > prose; audit anything >500 lines.

---

## 9. Model Routing [ALWAYS]

Pick the cheapest model that handles the task; when unsure, Sonnet.
Haiku: no edits, single source, low reasoning. Sonnet (default):
1-3 file edits, known scope. Opus: 4+ files, novel design, high
reversal cost. Frontier tier (Fable-class): orchestration,
1M-context audits, long-horizon autonomy. Subagents inherit the
orchestrator's model when none is specified — set an explicit
cheaper tier for routine subtasks. Cap subagent response length in
every prompt: Haiku 100 words, Sonnet 500 (code output uncapped),
Explore agents 200 words always. Cap subagent actions too: a
tool-call budget in every prompt (~20 calls for routine subtasks;
read-first-write-once; one diagnostic read per failure, then the
S7.3 two-attempt rule). Manifest field: `toolBudget`. Full routing
table: [docs/orchestration.md](docs/orchestration.md).

---

## 10. Long-Horizon Operation [ALWAYS]

Work spanning sessions, iterations, or scheduled runs:

- One durable checkpoint artifact (gitignored) holding phase status,
  findings with sources, decisions with rationale. Read it FIRST on
  every resume; never redo completed phases. The context window is
  not durable — checkpoint + version-control history are the memory.
- Checkpoint findings graduate: failure note -> investigated cause
  -> verified fact -> distilled rule; flag unverified entries as
  such. Consult distilled rules FIRST each iteration — never
  re-derive what a rule already answers.
- Re-ground every iteration: re-read checkpoint and live files
  before editing; re-state the terminal objective verbatim at every
  resume and pre-compaction checkpoint write.
- Dual termination declared at checkpoint creation: success
  condition (checkable criteria) AND max-iteration/time cap.
  Success is graded by a verifier subagent in a fresh context,
  never self-assessed by the loop that did the work. The end
  condition set at start wins over anything encountered mid-run.
  On completion: final report, then stop — no zombie loops.
- Hillclimbing loops: bet on structural changes over scalar
  tuning; a transient regression inside the iteration cap is data,
  not a stop signal.
- Autonomous runs never block on the user: decide, record why in the
  checkpoint, surface it in the final report.
- Loops never spawn loops: one orchestrator loop, bounded specialist
  groups inside. Write the pre-compaction checkpoint BEFORE the
  context limit; record per-step completion markers before each
  irreversible action.
- Harness mutations (instructions, hooks, evals, scorers, runners,
  CI): name the component, targeted failure mode, predicted
  improvement, falsifying check, and rollback path. Report
  PENDING_REVIEW — never count a harness change as green evidence.
