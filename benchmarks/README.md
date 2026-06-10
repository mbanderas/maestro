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
4. Copies `verify.cjs` into the work dir only **after** the agent
   exits, then runs it and records pass/fail, wall time, and the token /
   turn / cost figures the CLI reports.

**Hidden oracle.** The agent never sees `verify.cjs` during the run.
Visible ground-truth tests inflate agent resolution rates 20-60%
(FeatureBench, arXiv:2602.10975) and turn the task into
test-satisfaction instead of spec-satisfaction. Results recorded before
2026-06-10 were measured with the oracle visible in the work dir and
are NOT comparable to later results; affected summaries are labeled
in place.

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
| `t07-feat-report-subsystem` | multi-file feature (m) | add report module + CLI command + config flag + docs across a 9-file app |
| `t08-refactor-error-convention` | cross-cutting refactor (m) | introduce `AppError` and convert every throw site across 10 modules |
| `t09-feat-notification-module` | hidden-invariant feature (m) | add a module to an ops console whose conventions (registry order, strings table, declared events, config schema, docs format) are discoverable but unstated; verify checks them as hidden invariants |
| `t10-feat-staged-formatter` | staged self-extension (m) | three staged byte-exact contracts in one prompt; regression traps re-check stage 1 after stage 3 |
| `t11-feat-arg-validation` | large-scope feature (l) | declarative validation layer across 14 command modules + dispatcher + docs (19 files); seeded ad-hoc validation must be removed |

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
- **A/B invariant (hard rule):** cells differ ONLY in doctrine-file
  presence. Same CLI flags, model, budget cap, isolation, and hidden
  oracle in both modes — harness changes move agent scores 10-20 pp on
  their own, so any second variable voids the comparison.
- **Effect-size floor:** at n=3, differences under ~5 pp are noise
  (single-run pass@1 varies 2.2-6.0 pp at temp 0, arXiv:2602.07150).
  Label them indistinguishable; claims about small effects need n>=9.
- **Void rule:** rows with `is_error: true` (CLI/API failure — the
  agent never ran or was cut off) are voids, not failures: excluded
  from every tally, documented with their count, and re-run. The
  runner records `is_error` and the checker's first output line
  (`verify_note`) per row precisely so voids are distinguishable from
  genuine misses.
- **Honesty rule:** unmeasured cells do not appear in any README table.
  No extrapolation, no "expected" numbers.

## Running

Windows:

```powershell
pwsh -NoProfile -File benchmarks/run-maestro-bench.ps1            # all tasks, both modes
pwsh -NoProfile -File benchmarks/run-maestro-bench.ps1 -Task t01-fix-inclusive-range -Runs 3
pwsh -NoProfile -File benchmarks/run-maestro-bench.ps1 -Task t09-feat-notification-module -Mode core -Runs 3
```

`-Mode core` runs a third cell bundling the compact
[`variants/AGENTS-core.md`](variants/AGENTS-core.md) (~50 lines)
instead of the full doctrine — the A/B/C cell for the compression
hypothesis (docs/research-2026.md, Track D).

macOS / Linux (requires [`jq`](https://jqlang.github.io/jq/)):

```bash
./benchmarks/run-maestro-bench.sh                                  # all tasks, both modes
./benchmarks/run-maestro-bench.sh -t t01-fix-inclusive-range -r 3
```

Results land in `benchmarks/results/<timestamp>-claude-<model>.json`
(Claude runner) or `benchmarks/results/<timestamp>-<cli>.json`
(cross-CLI runner; model recorded inside each row).

## Other CLIs (Codex, Gemini)

The harness is CLI-agnostic; `run-cli-bench.ps1 -Cli codex|gemini`
runs the same fixture/verify flow through either CLI. Verified
invocations and isolation (flags and global state checked against the
installed CLIs, 2026-06-10):

- **Codex** — `codex exec --json --skip-git-repo-check --ephemeral
  --dangerously-bypass-approvals-and-sandbox "<prompt>"` with a fresh
  `CODEX_HOME` containing only `auth.json`, so no global config, MCP
  servers, plugins, or hooks load. ON cell = `AGENTS.md` only (Codex
  reads it natively; no adapter file). Pipe stdin (`'' |`) — `codex
  exec` blocks waiting for stdin EOF otherwise.
- **Gemini** — `gemini -p "<prompt>" --output-format json
  --approval-mode yolo --skip-trust` in the work dir. ON cell =
  `AGENTS.md` + `GEMINI.md`. No home-override env exists; the OFF cell
  is only valid because `~/.gemini` was inspected and carries no
  instruction files — re-check before trusting an OFF cell on another
  machine.

Neither CLI reports cost/turn fields identically to Claude Code —
record at minimum pass/fail and wall time, and whatever usage fields
the JSON output exposes. Measured rows:
[`results/20260610-summary-codex-gemini.md`](results/20260610-summary-codex-gemini.md).

## Results

Measured results are committed under [`results/`](results/) as raw
JSON. Summary tables in the top-level README only ever contain rows
backed by a results file.
