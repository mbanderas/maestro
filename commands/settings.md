---
description: View and change Maestro's toggles (terse, frontier, context-bar) with a keyboard picker
argument-hint: "[status]"
allowed-tools: Bash, AskUserQuestion
---

Show every current Maestro toggle and let the user flip each one with the
keyboard. The toggles are terse output, the frontier fusion engine, and the
context-bar status line. `compress` is an action, not a toggle, so it is not
shown here.

One writer owns all state: `settings/cli.cjs`, which reads and writes the
three existing stores (the terse `config.json` plus its live flag, the
frontier state file, and the context-bar flag). This command never edits
those files directly; it always goes through the CLI so the existing readers
stay in sync.

The interactive picker is the agent's `AskUserQuestion` tool: a keyboard
selector, not the built-in `/model` widget (a plugin cannot render that one).
Because `AskUserQuestion` allows at most 4 options per question, the frontier
choice is a short cascade so that **every** model and preset is reachable
without ever typing a name.

Requested action: `$ARGUMENTS`

## Steps

1. **Read state and the catalog.** Run both:

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/settings/cli.cjs" status --json
   node "${CLAUDE_PLUGIN_ROOT}/settings/cli.cjs" list --json
   ```

   `status` is the current values; `list` is every value a picker may offer
   (terse levels, frontier models/presets sourced from `frontier/config.cjs`,
   judge/synth defaults, context-bar values). Build all options below from
   `list` — never hardcode a model or preset name in this command.

   If `$ARGUMENTS` is `status`, print the current values in a short readable
   list and stop. Otherwise continue.

2. **First call — the three toggles (one `AskUserQuestion` call, three
   questions).** Pre-select each current value so leaving it unchanged is the
   default; only write a toggle later if its answer differs from `status`.

   - terse: options = `list.terse.values` (`off`, `lite`, `full`, `ultra`).
   - context-bar: options = `list.contextBar.values` (`on`, `off`).
   - frontier mode: `off`, `single`, `fusion` (`list.frontier.modes`).

3. **Frontier follow-ups** (only if the chosen frontier mode is not `off`):

   - **single** → one question, `model`, options = `list.frontier.models`
     (label each `"<label>"`, value `<id>`; 3 options, fits one question).
     The result is `single:<id>`.

   - **fusion** → pick a preset from `list.frontier.presets` (named presets
     plus `custom`). There are more than 4, so **page them 3 at a time**:
     show the first three presets plus a fourth option `More presets…`; if the
     user picks `More presets…`, ask again with the next three (continue until
     all presets, including `custom`, have been offered). Mark `opus-gpt` as
     recommended. Never drop a preset and never ask the user to type its name.

     - If the chosen preset is **custom** → one `multiSelect` question,
       `models`, options = `list.frontier.models`; the user selects 2–8. The
       result is `fusion:custom --models <ids joined by commas>`. (Same-model
       duos such as Opus+Opus are already the named `opus-duo`/`gpt-duo`
       presets; only an exotic duplicate combo would need the typed
       `--models opus,opus` form.)

     - After any fusion preset, offer one question: **override judge/synth?**
       `No` (use the defaults) or `Yes`. The effective default is
       `list.frontier.presetStages[<preset>]` if present, otherwise
       `list.frontier.defaults` (so the prompt can state, e.g.,
       `judge=opus, synth=opus`, but `gpt-duo` shows `gpt-5.5`). If `Yes`, ask
       two questions in one call — `judge` and `synth` — each with options
       `list.frontier.stageModels`. On Windows, prefer `opus` or `gpt-5.5`
       for judge/synth; `gemini` degrades there (see `commands/frontier.md`).

4. **Write each change through the CLI** (only for toggles whose value
   changed):

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/settings/cli.cjs" set terse <level>
   node "${CLAUDE_PLUGIN_ROOT}/settings/cli.cjs" set context-bar <on|off>
   node "${CLAUDE_PLUGIN_ROOT}/settings/cli.cjs" set frontier off
   node "${CLAUDE_PLUGIN_ROOT}/settings/cli.cjs" set frontier single:<model>
   node "${CLAUDE_PLUGIN_ROOT}/settings/cli.cjs" set frontier fusion:<preset> \
     [--models a,b,c] [--judge <model>] [--synth <model>]
   ```

   Report any `WARNING:` line the CLI prints — for example an active
   `MAESTRO_TERSE_LEVEL` override or an unconfirmed status-line script.

5. **Confirm** in one line per change, then run `status` again so the user
   sees the result.

## Codex and any other CLI

There is no keyboard picker on Codex (it cannot host one). Use the same CLI
directly — it is the writer this command calls:

```bash
node settings/cli.cjs status            # current values
node settings/cli.cjs list              # every available value
node settings/cli.cjs set frontier fusion:frontier-trio
node settings/cli.cjs set frontier fusion:custom --models opus,gpt-5.5,gemini
node settings/cli.cjs set frontier fusion:opus-gpt --judge opus --synth gpt-5.5
```

See [`docs/settings.md`](../docs/settings.md) for the full reference.
