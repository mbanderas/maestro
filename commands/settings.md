---
description: View and change Maestro's toggles (terse, frontier, context-bar) with a keyboard picker
argument-hint: "[status]"
allowed-tools: Bash, AskUserQuestion
---

Show every current Maestro toggle and let the user flip each one with the
keyboard, like the native `/model` picker. The toggles are terse output,
the frontier fusion engine, and the context-bar status line. `compress` is
an action, not a toggle, so it is not shown here.

One writer owns all state: `settings/cli.cjs`, which reads and writes the
three existing stores (the terse `config.json` plus its live flag, the
frontier state file, and the context-bar flag). This command never edits
those files directly; it always goes through the CLI so the existing
readers stay in sync.

Requested action: `$ARGUMENTS`

Steps:

1. Read the current values:
   `node "${CLAUDE_PLUGIN_ROOT}/settings/cli.cjs" status --json`.
   If `$ARGUMENTS` is `status`, print the values in a short readable list
   and stop.
2. Otherwise present the toggles with `AskUserQuestion` so the user picks
   with the keyboard. Pre-select the current value for each. Suggested
   questions (skip any the user does not want to change):
   - terse: `off`, `lite`, `full`, `ultra`
   - frontier: `off`, `single:opus`, `fusion:opus-gpt`, `fusion:frontier-trio`
     (for any other model or preset, take a typed value)
   - context-bar: `on`, `off`
3. For each change, write it through the CLI:
   `node "${CLAUDE_PLUGIN_ROOT}/settings/cli.cjs" set <key> <value>`
   (frontier accepts `--judge`, `--synth`, and `--models a,b,c`). Report any
   `WARNING:` line the CLI prints, for example an active `MAESTRO_TERSE_LEVEL`
   override or an unconfirmed status-line script.
4. Confirm in one line per change, then show the new `status` so the user
   sees the result.

On Codex and any other CLI there is no keyboard picker, because Codex
cannot host one. Use the same CLI directly:
`node settings/cli.cjs status` and `node settings/cli.cjs set <key> <value>`.
See [`docs/settings.md`](../docs/settings.md) for the full reference.
