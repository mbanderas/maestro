# Cross-CLI + Depth Cells — t08/t09/t11, 2026-06-10 (hidden-oracle runner)

Extends [20260610-summary-hidden-oracle.md](20260610-summary-hidden-oracle.md)
with: Gemini and Codex cells for t08/t09, claude t09 escalated to n=9,
and the t11 large-scope pilot. Same protocol: hidden oracle, isolated
config, voids excluded and counted, medians (even n = mean of middle
two). Numbers are NEVER compared across CLIs or models — each block
stands alone.

## Claude Code, sonnet

| Cell | n | Pass | Med wall | Med turns | Med cost | Med out-tok |
|---|---|---|---|---|---|---|
| t09 OFF | 9 | 8/9 | 147s | 19 | $0.287 | 5,160 |
| t09 ON | 9 | 8/9 | 143s | 18 | $0.315 | 5,478 |
| t11 OFF | 1 | 1/1 | 238s | 37 | $0.507 | 12,924 |
| t11 ON | 1 | 1/1 | 201s | 37 | $0.533 | 9,905 |

- t09 at n=9: pass parity persists exactly (8/9 both modes). ON median
  is now slightly faster (-2% wall) and one turn shorter at +10% cost.
  Still no capability separation in either direction.
- t11 (19-file, 14-command validation sweep) pilot, n=1 exploratory:
  both modes pass; ON -16% wall and -23% out-tokens at identical turn
  count. Same direction as t08's efficiency win — the bigger and more
  convention-bound the task, the better the doctrine pays. n=1: a
  hint, not a claim.

## Gemini CLI 0.45.2, gemini-3.1-pro-preview (global default model)

| Cell | n valid | Pass | Med wall | Med out-tok |
|---|---|---|---|---|
| t08 OFF | 3 | 3/3 | 119s | 3,272 |
| t08 ON | 3 | 3/3 | 71s | 2,182 (n=2 usage) |
| t09 OFF | 3 | 1/3 | 51s | n/a |
| t09 ON | 3 | 0/3 | 215s | n/a |

- **t08 efficiency win replicates at n=3**: ON median 71s vs OFF 119s
  (-40% wall) at equal 3/3 pass. Usage capture partial (gemini JSON
  noise; n=2 on ON out-tokens).
- **t09: gemini-pro passes 1 of 6 valid runs** (OFF 1/3, ON 0/3 — no
  doctrine advantage either direction). OFF failures are fast (25-51s
  quick wrong attempts; the one pass also fast at 79s); ON failures
  are long real attempts (127-229s). The hidden-invariant cell
  separates models far more than it separates the doctrine.
- **Voids: 6 total** — 2 mid-batch (~4s, no output) plus 4 in the
  re-run batch, root-caused via stderr: `TerminalQuotaError`
  (model capacity for gemini-3.1-pro-preview exhausted; resets ~2h).
  Heavy agentic batches (90-150k input tokens per run) drain the
  rolling cap quickly even on paid tiers. Both voided cells were
  re-measured after the quota reset (raw files 185626, 185759).
- **Isolation caveat (NEW)**: gemini loads global `~/.agents` skills
  even with a clean `~/.gemini` (observed: a skill-creator override in
  run stderr). Skills are dormant unless invoked, but this is a global
  input the harness cannot currently neutralize — documented as a
  standing caveat for gemini cells.

## Codex CLI 0.135.0, gpt-5.4-mini (cheap tier by design), n=1 exploratory

| Cell | Pass | Wall | Out-tok |
|---|---|---|---|
| t08 OFF | 1/1 | 109s | 3,277 |
| t08 ON | 1/1 | 125s | 5,703 |
| t09 OFF | 1/1 | 153s | 7,665 |
| t09 ON | 1/1 | 250s | 11,917 |

- gpt-5.4-mini passes everything, including t09 both modes — the cell
  gemini-pro failed 0/5 and claude-sonnet drops ~1-in-9 on. Model
  ranking on this suite does not follow price tiers.
- ON overhead pronounced: +15% wall / +74% out-tokens (t08), +63% wall
  / +55% out-tokens (t09). n=1 — exploratory only, no medians.

## Raw files

claude: 154004, 154821, 155723 (+ pooled files listed in the
hidden-oracle summary). gemini: 151318 (12 rows, 2 voids), 153937 +
154048 (4 rows, all quota voids), 185626 + 185759 (post-reset
top-ups). codex: 154257. Forensic fields
(`verify_note`, `agent_error`) recorded since commits 3c73e96/ca7c5fb.
