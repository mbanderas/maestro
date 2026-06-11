# Interactive S2-S6 runbook — measuring the Decision Gate in a real TTY session

Every measured configuration so far is non-interactive: headless
`claude -p` runs and two-turn stream-json interactive-PROXY sessions
(see `benchmarks/results/20260610-summary-followup.md`). A real
interactive TTY session — human typing, default permission prompts,
visible UI — is the one configuration no autonomous loop can drive.
This runbook is the manual protocol for taking that measurement
against the revised (actionable) Decision Gate.

## What you are measuring

1. **Gate verdict line** — does the assistant output
   `GATE: single-agent — <reason>` or `GATE: multi-agent — <trigger met>`
   before its first file edit (S1 requirement)?
2. **S2-S6 spawn rate** — does a multi-agent verdict actually spawn a
   Planner-class subagent via the Task/Agent tool? Default Explore
   recon does **not** count.
3. **Guardrail** — on a sub-trigger task, the verdict must be
   single-agent with **zero** spawns.

## Setup (isolation — do not skip)

Your global `~/.claude` contains Maestro; an unisolated session is a
contaminated cell. Use the same recipe as the benchmark runner:

```powershell
# 1. Fresh config dir with only credentials + empty settings
$cfg = Join-Path $env:TEMP "maestro-tty-config"
New-Item -ItemType Directory -Force $cfg | Out-Null
Copy-Item "$env:USERPROFILE\.claude\.credentials.json" $cfg
Set-Content "$cfg\settings.json" '{}'

# 2. Fresh work dir = fixture copy + doctrine ON
$work = Join-Path $env:TEMP "maestro-tty-t12"
Remove-Item $work -Recurse -Force -ErrorAction SilentlyContinue
Copy-Item benchmarks\tasks\t12-feat-export-subsystem\fixture $work -Recurse
Copy-Item AGENTS.md, CLAUDE.md $work

# 3. Launch the interactive session in that dir
$env:CLAUDE_CONFIG_DIR = $cfg
Set-Location $work
claude --model sonnet --strict-mcp-config
```

Do **not** copy `verify.cjs` into the work dir before or during the
session — the oracle stays hidden until the session ends.

## Protocol

- Turn 1: paste the task prompt verbatim from
  `benchmarks/tasks/t12-feat-export-subsystem/task.json` (`prompt`
  field). Interact as a normal user; approve permission prompts;
  do not hint at agents, planning, or the doctrine.
- Optional turn 2 (matches the interactive-PROXY shape): after the
  assistant reports completion, paste the follow-up from
  `benchmarks/probe-interactive-s2s6.cjs` (`FOLLOW_UP` const).
- Guardrail session: repeat the whole setup with
  `t01-fix-inclusive-range` — expect `GATE: single-agent` and zero
  spawns.
- n >= 3 sessions per task before comparing to any committed cell
  (protocol: `benchmarks/README.md`).

## What to capture

The TTY UI does not write stream JSONL. Capture:

- Full session transcript: `claude` writes session files under
  `$env:CLAUDE_CONFIG_DIR\projects\<work-dir-slug>\*.jsonl` even in
  interactive mode (verify the path exists after the first turn;
  `--no-session-persistence` would disable this — do NOT pass it).
- Wall time per turn (stopwatch or timestamps), and `/cost` output
  before exiting (manual cost record — interactive mode has no
  `result` event).

## Scoring

After the session exits:

```powershell
# Oracle (hidden until now)
Copy-Item ..\path\to\benchmarks\tasks\t12-feat-export-subsystem\verify.cjs $work
Push-Location $work; node verify.cjs; "EXIT=$LASTEXITCODE"; Pop-Location

# Spawns + verdict from the session JSONL (event-type-classified;
# raw grep false-positives on tool_result file-read echoes)
node benchmarks\parse-spawns.cjs <session-jsonl>   # or the inline parse below
```

Spawn rule: count `tool_use` blocks named `Task`/`Agent` in
**assistant** events; read `input.subagent_type`; ignore everything in
`user`/`tool_result` events. Verdict rule: `GATE:` must appear in an
assistant **text** block — `AGENTS.md` itself now contains `GATE:`
strings, so any match inside a file-read echo is noise, not evidence.

If the session JSONL shape differs from stream-json, fall back to
scoring the visible transcript manually for the verdict line and the
Task-tool UI banner for spawns, and say so in the results note.

Compliance behaviors (optional, stream-shaped files only):

```powershell
node benchmarks\score-compliance.cjs --dir <dir-with-jsonl>
```

## Reporting

Label the cell **interactive-TTY (manual, n=<k>)**. Record per
session: verdict line present (y/n + quoted line), spawns
(subagent_type list), oracle pass, wall, manual cost. Never merge
TTY rows into headless or PROXY cells — method is a cell axis.
File results as `benchmarks/results/<date>-interactive-tty-notes.md`
(manual cells get a notes file, not fabricated runner JSON).
