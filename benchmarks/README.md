# Maestro Benchmarks

Reproducible A/B harness measuring what the Maestro doctrine actually
changes: task success, wall time, agent turns, token usage, and cost —
with Maestro **ON** (`AGENTS.md` + `CLAUDE.md` present in the work dir)
versus **OFF** (doctrine files absent). Zero dependencies, same policy
as the rest of the repo.

## Design

Each task is a self-contained mini-repo (`fixture/`) plus a machine
prompt (`task.json`) and a deterministic checker (`verify.cjs`, plain
Node, exit 0 = pass). The runner:

1. Copies the fixture into a fresh temp work dir.
2. **ON cell only:** drops Maestro's `AGENTS.md` + `CLAUDE.md` into the
   work dir.
3. Invokes the agent CLI non-interactively in that dir
   (`claude -p <prompt> --output-format json`).
4. Runs `verify.cjs` and records pass/fail, wall time, and the token /
   turn / cost figures the CLI reports.

### Isolation (required for a valid OFF cell)

If your global `~/.claude/` already contains Maestro (or any other
instructions or hooks), the OFF cell is contaminated. The runner
therefore executes every cell under an isolated `CLAUDE_CONFIG_DIR`: a
temp config dir holding only a copy of `.credentials.json` and an empty
`settings.json`. No global CLAUDE.md, no hooks, no MCP servers, no
auto-memory — in either cell. The only variable between cells is the
presence of the doctrine files in the work dir.

Runs also pass `--strict-mcp-config --no-session-persistence
--max-budget-usd <cap> --dangerously-skip-permissions`. The permission
bypass is confined to a throwaway temp dir containing only the fixture.

## Task suite

| Task | Category | Fixture |
|---|---|---|
| `t01-fix-inclusive-range` | single-file fix | off-by-one in `sumRange` |
| `t02-fix-even-median` | single-file fix | even-length median bug |
| `t03-feat-slugify` | multi-file feature | add `slugify` + re-export |
| `t04-feat-cli-repeat` | multi-file feature | add `--repeat N` CLI flag |
| `t05-refactor-rename` | refactor | rename across 3 files, 2 import styles |
| `t06-audit-dead-code` | audit | identify 3 dead functions, write AUDIT.md |

Every `verify.cjs` fails on the pristine fixture and passes on a
correct solution — verify both directions yourself before trusting a
new or modified task: run `node verify.cjs` against a pristine fixture
copy (must exit 1) and against a hand-fixed copy (must exit 0).

## Scoring protocol

- **Cells:** task x mode (ON/OFF) x CLI x model.
- **n >= 3 runs per cell** before a number is publishable. Fewer runs
  are exploratory and must be labeled with their n.
- **Success** = `verify.cjs` exit 0. Binary; no partial credit.
- **Report per cell:** success rate, median wall ms, median turns,
  median cost USD, median output tokens. Medians, not means — single
  runs hit retries and cache variance.
- **Never compare across models or CLI versions.** Record both in the
  results file.
- **Honesty rule:** unmeasured cells do not appear in any README table.
  No extrapolation, no "expected" numbers.

## Running

Windows:

```powershell
pwsh -NoProfile -File benchmarks/run-maestro-bench.ps1            # all tasks, both modes
pwsh -NoProfile -File benchmarks/run-maestro-bench.ps1 -Task t01-fix-inclusive-range -Runs 3
```

macOS / Linux (requires [`jq`](https://jqlang.github.io/jq/)):

```bash
./benchmarks/run-maestro-bench.sh                                  # all tasks, both modes
./benchmarks/run-maestro-bench.sh -t t01-fix-inclusive-range -r 3
```

Results land in `benchmarks/results/<timestamp>-<cli>-<model>.json`.

## Other CLIs (Codex, Gemini)

The harness is CLI-agnostic; only step 3 changes. Verified
non-interactive invocations (flags checked against the installed CLIs,
2026-06-10):

- **Codex** — `codex exec "<prompt>"` in the work dir. ON cell =
  `AGENTS.md` only (Codex reads it natively; no adapter file).
  Config overrides via `-c key=value`.
- **Gemini** — `gemini -p "<prompt>" --output-format json
  --approval-mode yolo` in the work dir. ON cell = `AGENTS.md` +
  `GEMINI.md`.

Neither CLI reports cost/turn fields identically to Claude Code —
record at minimum pass/fail and wall time, and whatever usage fields
the JSON output exposes. Isolation analogs: Codex reads
`~/.codex/config.toml` (override with `-c`), Gemini reads
`~/.gemini/` — check for global instruction files before trusting an
OFF cell.

## Results

Measured results are committed under [`results/`](results/) as raw
JSON. Summary tables in the top-level README only ever contain rows
backed by a results file.
