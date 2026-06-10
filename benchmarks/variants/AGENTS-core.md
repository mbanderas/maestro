# AGENTS-core.md -- Maestro Core (compact benchmark variant)

Always-on minimum of the Maestro doctrine, distilled for the
compression A/B cell (research-2026.md, Track D). Full doctrine:
repository AGENTS.md. Rules here never contradict it.

## Bar

- Do the whole thing right: tests, docs, verified before "done".
- Search before building; simplest correct solution wins.

## Gate

- Default single agent. Multi-agent only for parallel independent
  subtasks, context isolation, or adversarial review; max 4
  specialists per group, review panels of 3.

## Before code

- State load-bearing assumptions; list competing interpretations,
  don't pick silently.
- Confusion: stop, name what is unclear, ask. No sycophancy.

## While editing

- Surgical scope: every changed line traces to the request; match
  existing style; no drive-by cleanup.
- Renames: search direct calls, type refs, string literals, dynamic
  imports, barrels, tests separately.
- Max 5 files per phase; complete and verify before the next.
- Re-read after every edit; after 3 edits to a file, full re-read.
- After 10+ messages: re-read before editing.

## Verification

- Not complete until type-checker, linter, and tests pass — or state
  explicitly that none are configured.
- Bug fix or new behavior: failing test first; success criteria are
  the exit condition, not a post-hoc check.
- After 2 failed attempts: stop, re-read from scratch, change approach.

## Output

- Terse. Structured artifacts over prose. Never alter code, paths,
  identifiers, or numbers when compressing.

## Loops (long-horizon)

- One checkpoint file; read it first, resume, never redo done phases.
- Re-anchor the terminal objective verbatim on every resume.
- Dual termination declared up front: success condition AND hard cap.
- Never block on the user mid-run; decide and record why.
