# Maestro Hooks (Claude Code)

## Claude Code: Verification Hook

Maestro ships an optional `SubagentStop` hook for Claude Code that
enforces the Section 7.3 verification rule structurally: no prompt
reminder, no relying on the model to police itself. When a subagent
stops, the hook checks three things and emits a soft warning if any
fails:

1. Are there orphaned `background_tasks` still active? If so, the
   subagent is declaring complete while work is still running. Scoped
   to agents whose transcript shows they spawned background work,
   the payload field is machine-wide, and unrelated sessions' tasks
   must not nag an agent that spawned nothing.
2. Did a file-modifying subagent run a type-checker, linter, or test
   runner? If not, it likely skipped verification.
3. Does a file-modifying subagent's final report carry one of the
   Section 7.3 status tokens (`VERIFIED` / `PENDING_REVIEW` /
   `UNVERIFIED` / `FAIL`)? Uppercase only; lowercase "verified" in
   prose is not a status declaration.

Three safety properties keep the warning from doing more harm than
good (a warning on stop extends the subagent's turn, so a careless
guard can displace the final report the orchestrator is waiting for):

- **Read-only agents are exempt.** Explore/Plan agent types, or any
  agent whose transcript shows no `Edit`/`Write`/`NotebookEdit` calls
  and no recognizable Bash mutation (e.g. `git commit`), have nothing
  to verify and are never warned.
- **Fires at most once per agent.** The warning re-prompts the agent,
  which stops again and re-triggers the hook; without a once-guard
  the loop pushes the real report out of the final message.
- **The report survives.** The warning text tells the agent to restate
  its complete final report, since only the last message is returned
  to the orchestrator.

The hook never blocks. It injects `additionalContext` so the next
turn sees the warning and can re-verify. Recognized tools include
`tsc --noEmit`, `eslint`, `pytest`, `jest`, `vitest`, `go test`,
`cargo test`, `npm/pnpm/yarn test`, `ruff check`, `mypy`,
`prettier --check`, and `biome check`.

The file ships as `.cjs` so Node treats it as CommonJS even if a
`"type": "module"` package.json exists somewhere above your
`~/.claude/hooks/` directory. Tests live next to it; run
`node hooks/maestro-subagent-guard.test.cjs` from the repo root.

**Install:** download into `~/.claude/hooks/` and wire into
`~/.claude/settings.json`:

**Install** on Windows / PowerShell:

```powershell
mkdir ~/.claude/hooks -Force
curl.exe -o ~/.claude/hooks/maestro-subagent-guard.cjs https://raw.githubusercontent.com/mbanderas/maestro/main/hooks/maestro-subagent-guard.cjs
```

**Install** on macOS / Linux:

```bash
mkdir -p ~/.claude/hooks
curl -o ~/.claude/hooks/maestro-subagent-guard.cjs https://raw.githubusercontent.com/mbanderas/maestro/main/hooks/maestro-subagent-guard.cjs
```

Add a `SubagentStop` entry under `hooks` in `~/.claude/settings.json`
(merge with any existing hooks block):

```jsonc
"hooks": {
  "SubagentStop": [
    {
      "matcher": "",
      "hooks": [
        {
          "type": "command",
          "command": "node \"/absolute/path/to/.claude/hooks/maestro-subagent-guard.cjs\""
        }
      ]
    }
  ]
}
```

On Windows, use the absolute path with escaped backslashes, e.g.
`"C:\\Users\\you\\.claude\\hooks\\maestro-subagent-guard.cjs"`.

The hook requires Claude Code 2.1.145 or later; earlier versions do
not include `background_tasks` in the `SubagentStop` payload. The
`agent_type` and `agent_transcript_path` fields it reads were added
earlier (2.1.69 and 2.0.42); when absent the hook degrades gracefully
and simply warns less.

## Claude Code: Hook Pack

Six more optional hooks enforce other Maestro rules structurally.
Same engineering rules as the verification hook: plain Node `.cjs`,
zero dependencies, fire-once guards, graceful degradation on missing
payload fields. All warn softly except the doctrine guard (denies by
design — re-reading autoloaded doctrine is never the right call) and the
verify gate when armed to `block`; each deny/block reason tells the
model what to do instead. Tests live next to each hook (`node
hooks/<name>.test.cjs`).

| Hook | Event | Enforces |
|---|---|---|
| `maestro-doctrine-guard.cjs` | `PreToolUse` (Read) | S7.2 context integrity: denies a `Read` of `AGENTS.md`/`CLAUDE.md` while the doctrine is autoloaded (doctrine file present at cwd) with an instructive reason. `MAESTRO_DOCTRINE_GUARD=once` allows the first read per session (for runtimes whose subagents lack the doctrine in context); `=0` disables. `docs/orchestration.md` is never guarded |
| `maestro-loop-guard.cjs` | `Stop` | S10 long-horizon: warns when a looping session (session crons or `ScheduleWakeup` calls) has no `_<task>.md` checkpoint artifact in the working directory, or exceeds the iteration cap (`MAESTRO_LOOP_MAX_ITER`, default 50) |
| `maestro-phase-scope.cjs` | `PostToolUse` | S7.1 phase scope: warns when more than 5 distinct files (`MAESTRO_PHASE_FILE_CAP`) are modified in a single turn |
| `maestro-gate-reminder.cjs` | `UserPromptSubmit` | S1 gate: injects a minimal verdict reminder on the first prompt of a session — the live frontier badge + the parseable verdict template + a pointer to `AGENTS.md S1` (~43 tok; the full spec stays in cached doctrine, not re-emitted). Fire-once; opt-out `MAESTRO_GATE_REMINDER=0` |
| `maestro-verify-gate.cjs` | `Stop` | S7.3 verification: when a session modified files but ran **no** checker (test/lint/tsc) AND stated **no** honest status token (UNVERIFIED/PENDING_REVIEW/FAIL), nudges once. Mode = the persisted `verify` toggle (`settings set verify <off\|warn\|block>`) or the `MAESTRO_VERIFY_GATE` env override: `warn` (default) injects a non-blocking reminder; `block` blocks the Stop once to force a checker run or honest token; `off` disables. A `VERIFIED` claim with no checker still fires (S7.3: no checker → never VERIFIED). Parses both Claude JSONL transcripts and Codex rollouts (format auto-detected from the transcript content), so `block` enforces on the Codex `Stop` event as well. Block-once per session; respects `discipline off` |
| `maestro-gate-telemetry.cjs` | `SessionEnd` | S1 audit (opt-in): logs one JSON line per session with gate decision (single/multi), specialist count, end reason, and token usage (input/output/cache/turns) |

**Privacy (gate telemetry):** the telemetry hook does nothing unless
you set `MAESTRO_TELEMETRY=1`. When enabled it appends to
`~/.claude/maestro-telemetry.jsonl` on your machine: counts, the end
reason, and the project folder *name* only. No prompts, no file
contents, no full paths, no network, ever.

**Codex parity (not a hook):** `scripts/codex-telemetry.cjs` records the
same token fields for Codex sessions (rollouts under `~/.codex/sessions`)
with `source:"codex"`. Codex has no session-end hook, so run it manually
(`node scripts/codex-telemetry.cjs --latest`) — see
[docs/codex.md](codex.md#token-telemetry).

**Install** on Windows / PowerShell:

```powershell
mkdir ~/.claude/hooks -Force
curl.exe -o ~/.claude/hooks/maestro-doctrine-guard.cjs https://raw.githubusercontent.com/mbanderas/maestro/main/hooks/maestro-doctrine-guard.cjs
curl.exe -o ~/.claude/hooks/maestro-loop-guard.cjs https://raw.githubusercontent.com/mbanderas/maestro/main/hooks/maestro-loop-guard.cjs
curl.exe -o ~/.claude/hooks/maestro-phase-scope.cjs https://raw.githubusercontent.com/mbanderas/maestro/main/hooks/maestro-phase-scope.cjs
curl.exe -o ~/.claude/hooks/maestro-gate-reminder.cjs https://raw.githubusercontent.com/mbanderas/maestro/main/hooks/maestro-gate-reminder.cjs
curl.exe -o ~/.claude/hooks/maestro-verify-gate.cjs https://raw.githubusercontent.com/mbanderas/maestro/main/hooks/maestro-verify-gate.cjs
curl.exe -o ~/.claude/hooks/maestro-gate-telemetry.cjs https://raw.githubusercontent.com/mbanderas/maestro/main/hooks/maestro-gate-telemetry.cjs
```

**Install** on macOS / Linux:

```bash
curl -o ~/.claude/hooks/maestro-doctrine-guard.cjs https://raw.githubusercontent.com/mbanderas/maestro/main/hooks/maestro-doctrine-guard.cjs
curl -o ~/.claude/hooks/maestro-loop-guard.cjs https://raw.githubusercontent.com/mbanderas/maestro/main/hooks/maestro-loop-guard.cjs
curl -o ~/.claude/hooks/maestro-phase-scope.cjs https://raw.githubusercontent.com/mbanderas/maestro/main/hooks/maestro-phase-scope.cjs
curl -o ~/.claude/hooks/maestro-gate-reminder.cjs https://raw.githubusercontent.com/mbanderas/maestro/main/hooks/maestro-gate-reminder.cjs
curl -o ~/.claude/hooks/maestro-verify-gate.cjs https://raw.githubusercontent.com/mbanderas/maestro/main/hooks/maestro-verify-gate.cjs
curl -o ~/.claude/hooks/maestro-gate-telemetry.cjs https://raw.githubusercontent.com/mbanderas/maestro/main/hooks/maestro-gate-telemetry.cjs
```

Wire into `~/.claude/settings.json` (merge with any existing `hooks`
block; use absolute paths, escaped backslashes on Windows):

```jsonc
"hooks": {
  "PreToolUse": [
    { "matcher": "Read", "hooks": [
      { "type": "command", "command": "node \"/absolute/path/to/.claude/hooks/maestro-doctrine-guard.cjs\"" }
    ]}
  ],
  "Stop": [
    { "matcher": "", "hooks": [
      { "type": "command", "command": "node \"/absolute/path/to/.claude/hooks/maestro-loop-guard.cjs\"" },
      { "type": "command", "command": "node \"/absolute/path/to/.claude/hooks/maestro-verify-gate.cjs\"" }
    ]}
  ],
  "PostToolUse": [
    { "matcher": "Edit|Write|NotebookEdit", "hooks": [
      { "type": "command", "command": "node \"/absolute/path/to/.claude/hooks/maestro-phase-scope.cjs\"" }
    ]}
  ],
  "UserPromptSubmit": [
    { "matcher": "", "hooks": [
      { "type": "command", "command": "node \"/absolute/path/to/.claude/hooks/maestro-gate-reminder.cjs\"" }
    ]}
  ],
  "SessionEnd": [
    { "matcher": "", "hooks": [
      { "type": "command", "command": "node \"/absolute/path/to/.claude/hooks/maestro-gate-telemetry.cjs\"" }
    ]}
  ]
}
```

The loop guard reads the `session_crons` Stop-payload field and Stop
`additionalContext` output, both available in current Claude Code
releases (see the Claude Code changelog); on older versions it simply
stays silent.
