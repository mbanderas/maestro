---
description: Toggle the Maestro context progress bar in the Claude Code status line
argument-hint: [on|off]
allowed-tools: Bash, Read
---

Toggle the Maestro context bar shown in the Claude Code status line.

The bar is rendered by `context-bar.ps1` (Windows) or `context-bar.sh`
(macOS / Linux) in the Claude Code statusline directory, normally
`~/.claude/statusline/`. It self-gates on a flag file named
`.context-bar-disabled` in that same directory:

- flag file ABSENT  -> bar enabled (default)
- flag file PRESENT -> bar disabled (status line shows the folder name only)

Requested state: `$ARGUMENTS`

Steps:

1. Find the statusline directory: it is the directory containing the script
   path in the `statusLine.command` field of `~/.claude/settings.json`.
   Default to `~/.claude/statusline/` if it cannot be determined.
2. Resolve the action against the flag file `.context-bar-disabled` in that
   directory:
   - `on` / `enable`   -> delete the flag file (no-op if already absent).
   - `off` / `disable` -> create an empty flag file.
   - no argument       -> toggle: delete the flag if present, else create it.
3. Confirm the resulting state in one line. The change takes effect on the
   next status line refresh.
