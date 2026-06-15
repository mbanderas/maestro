---
description: View and change Maestro's toggles (terse, frontier, context-bar) — direct args or a keyboard picker
argument-hint: "[status | list | help | set <key> <value> | terse|frontier|context-bar <value>]"
allowed-tools: Bash, AskUserQuestion
---

See and change Maestro's toggles: terse output, the frontier fusion engine,
and the context-bar status line. `compress` is an action, not a toggle, so it
is not shown here.

Two ways to use it. With **no arguments** it opens a keyboard picker. With
**arguments** it runs the change directly and finishes — no questionnaire.

One writer owns all state: `settings/cli.cjs`, which reads and writes the
three existing stores. This command never edits those files directly; it
always goes through the CLI so the existing readers stay in sync. Throughout,
`SCLI` = `node "${CLAUDE_PLUGIN_ROOT}/settings/cli.cjs"`.

Requested action: `$ARGUMENTS`

## Route on `$ARGUMENTS`

Trim it and split into tokens. The first token selects the path; **anything
non-empty skips the picker entirely.**

- **empty** → run the **Interactive picker** section below.
- **`status`** (optionally `--json`) → run `SCLI status [--json]`, print it, stop.
- **`list`** (optionally `--json`) → run `SCLI list [--json]`, print it, stop.
- **`help`**, `-h`, `--help`, or anything unrecognized → run `SCLI help`,
  print it (usage grammar + the full value matrix), stop. For an
  unrecognized token, say so first, then show help.
- **`set <key> <value> [flags]`** → pass straight through:
  `SCLI set <key> <value> [--judge M] [--synth M] [--models a,b,c]`.
- **shorthand** — first token is a key (`terse`, `frontier`, `context-bar`,
  or `bar`): treat the rest as the value and run `SCLI set <key> <value>`.

### Normalizing the value (both `set` and shorthand)

The CLI takes one frontier value with a colon (`single:opus`,
`fusion:opus-gpt`). Accept the friendlier space form and normalize:

- `frontier off` → `SCLI set frontier off`
- `frontier single opus` → `SCLI set frontier single:opus`
- `frontier fusion opus-gpt` → `SCLI set frontier fusion:opus-gpt`
- `frontier fusion custom --models opus,gpt-5.5,gemini`
  → `SCLI set frontier fusion:custom --models opus,gpt-5.5,gemini`
- `frontier fusion opus-gpt --judge opus --synth gpt-5.5` → pass the flags through
- already-coloned (`frontier fusion:opus-gpt`) → pass as-is
- `terse ultra`, `context-bar off` → `SCLI set terse ultra`, `SCLI set context-bar off`

After any write, report any `WARNING:` line the CLI prints (for example an
active `MAESTRO_TERSE_LEVEL` override or an unconfirmed status-line script),
then run `SCLI status` so the result is visible. Confirm in one line.

If a value is invalid the CLI exits non-zero with a message — relay it and
show `SCLI help` so the user sees the valid values.

## Interactive picker (no arguments)

1. Read state and the catalog: `SCLI status --json` and `SCLI list --json`.
   Build every option below from `list` — never hardcode a model or preset.

2. First `AskUserQuestion` call, three questions, each pre-set to the current
   value (only write a toggle whose answer differs from `status`):
   - terse: `list.terse.values` (`off`, `lite`, `full`, `ultra`).
   - context-bar: `list.contextBar.values` (`on`, `off`).
   - frontier mode: `off`, `single`, `fusion` (`list.frontier.modes`).

3. Frontier follow-ups (only if mode is not `off`):
   - **single** → one question, `model` = `list.frontier.models` (3, fits);
     result `single:<id>`.
   - **fusion** → pick from `list.frontier.presets` (named presets + `custom`);
     there are more than 4, so **page them 3 at a time** with a fourth
     `More presets…` option that re-asks with the next three until all,
     including `custom`, have been offered. Never drop a preset or require
     typing its name.
     - **custom** → one `multiSelect` question, `models` = `list.frontier.models`,
       2–8 selected; result `fusion:custom --models <ids,joined>`.
     - After any fusion preset, offer **override judge/synth?** (`No` uses
       `list.frontier.presetStages[preset]` if present else
       `list.frontier.defaults`; `Yes` → two questions, `judge` and `synth`,
       each `list.frontier.stageModels`). On Windows prefer `opus`/`gpt-5.5`;
       `gemini` degrades as judge/synth (see `commands/frontier.md`).

4. Write each change with `SCLI set ...` (as in the routing section), report
   warnings, then show `SCLI status`.

## Codex and any other CLI

No keyboard picker (Codex cannot host one). Use the CLI directly — it is the
writer this command calls:

```bash
node settings/cli.cjs help               # usage grammar + every value
node settings/cli.cjs status             # current values
node settings/cli.cjs set frontier fusion:frontier-trio
node settings/cli.cjs set frontier fusion:custom --models opus,gpt-5.5,gemini
node settings/cli.cjs set frontier fusion:opus-gpt --judge opus --synth gpt-5.5
```

See [`docs/settings.md`](../docs/settings.md) for the full reference.
