# Benchmark results — 2026-06-10, Codex + Gemini cells, n=3 per cell

First cross-CLI rows: smallest three tasks (t01, t02, t06), both modes,
n=3 per cell per CLI. Medians, small sample, no significance claims.
Per protocol, never compare numbers across CLIs or models — each CLI's
rows are comparable only within that CLI's table.

## Invocation + isolation (verified against installed CLIs, 2026-06-10)

- **Codex** `codex-cli 0.135.0`, model pinned `-m gpt-5.5`. Runner:
  `run-cli-bench.ps1 -Cli codex`. Isolation: fresh `CODEX_HOME`
  containing only `auth.json` — no global `config.toml`, so no MCP
  servers, plugins, hooks, or instruction files load (`~/.codex` was
  inspected: no global `AGENTS.md` existed). Flags:
  `exec --json --skip-git-repo-check --ephemeral
  --dangerously-bypass-approvals-and-sandbox` (bypass confined to the
  throwaway fixture dir, same rationale as the Claude cell's
  `--dangerously-skip-permissions`). ON cell = repo `AGENTS.md` in the
  work dir (Codex reads it natively).
- **Gemini** `0.45.2`, model pinned `-m gemini-3.1-pro-preview`.
  Runner: `run-cli-bench.ps1 -Cli gemini`. Isolation caveat: Gemini CLI
  exposes no home-override env var; `~/.gemini` was inspected and
  contains no `GEMINI.md` and no instruction-bearing settings (only
  model pin + session retention), so both cells share identical clean
  global state — the only variable is the doctrine files in the work
  dir. Flags: `-p <prompt> --output-format json --approval-mode yolo
  --skip-trust`. ON cell = repo `AGENTS.md` + `GEMINI.md`.
- Neither CLI reports cost USD in machine output here; wall time and
  token counts are recorded instead. No cross-CLI cost comparison is
  possible or attempted.
- One voided codex run is excluded and not in any raw file: the very
  first smoke invocation hung because the harness did not pipe stdin
  (codex exec waits for stdin EOF) and was killed manually after ~21
  minutes; the harness was fixed (`'' |` pipe) before all recorded runs.
- Raw data: `20260610-051729-codex.json`, `20260610-052905-codex.json`,
  `20260610-052347-gemini.json`, `20260610-054144-gemini.json`.

## Codex (gpt-5.5), per-cell medians (n=3)

| Task | Mode | Pass | Med wall ms | Med out tokens | Med in tokens |
|---|---|---|---|---|---|
| t01-fix-inclusive-range | off | 3/3 | 34,370 | 648 | 58,776 |
| t01-fix-inclusive-range | on | 3/3 | 74,415 | 1,366 | 106,348 |
| t02-fix-even-median | off | 3/3 | 35,656 | 730 | 58,884 |
| t02-fix-even-median | on | 3/3 | 55,467 | 1,187 | 89,264 |
| t06-audit-dead-code | off | 3/3 | 44,919 | 925 | 61,901 |
| t06-audit-dead-code | on | 3/3 | 66,908 | 1,526 | 93,743 |

## Gemini (gemini-3.1-pro-preview), per-cell medians (n=3)

| Task | Mode | Pass | Med wall ms | Med out tokens | Med in tokens |
|---|---|---|---|---|---|
| t01-fix-inclusive-range | off | 3/3 | 27,631 | 504 | 45,529 |
| t01-fix-inclusive-range | on | 3/3 | 34,895 | 474 | 88,554 |
| t02-fix-even-median | off | 3/3 | 28,011 | 580 | 50,055 |
| t02-fix-even-median | on | 3/3 | 27,538 | 438 | 59,707 |
| t06-audit-dead-code | off | 3/3 | 34,772 | 455 | 57,774 |
| t06-audit-dead-code | on | 3/3 | 32,295 | 434 | 75,973 |

## Reading (n=3, still small)

- **Success parity 36/36 across both CLIs** — same picture as the
  Claude cells: on small tasks the doctrine cannot improve a 100% pass
  rate, so overhead is the measurable effect.
- **Codex pays the largest ON overhead observed in the whole suite:**
  +49-117% median wall and +63-111% median output tokens across the
  three cells. The doctrine file lands as plain input (+30-48k median
  input tokens) and gpt-5.5 visibly spends turns engaging with it.
- **Gemini's ON overhead is mostly input-side** (+10-43k median input
  tokens from reading the doctrine); median wall differences (-7% to
  +26%) are smaller than the run-to-run spread within cells, and output
  tokens are roughly flat — it appears to largely read past the
  doctrine on tasks this small.
- These cells say nothing about whether the doctrine helps either CLI
  on harder tasks; t07/t08-class cross-CLI cells were not run (budget
  scoped to the smallest three tasks) and remain future work.
