# Maestro Settings

One place to see and change Maestro's toggles. Interactive in Claude Code
with a keyboard picker, and a portable CLI everywhere else. The feature is a
front-end over Maestro's existing state; it stores nothing of its own, so the
terse hook, the frontier engine, and the context-bar scripts keep reading
exactly what they read today.

The design and the staff-engineer review are recorded in
[`settings-design.md`](settings-design.md).

## What it covers

| Toggle | Values | What it controls |
|---|---|---|
| `terse` | `off`, `lite`, `full`, `ultra` | Output-token reduction (`/maestro:terse`). |
| `frontier` | `off`; `single:` `opus` / `gpt-5.5` / `gemini`; `fusion:` `opus-duo` / `opus-gpt` / `gpt-duo` / `frontier-trio` / `custom`, each with optional `--judge` / `--synth` | The local multi-CLI fusion engine (`/maestro:frontier`). |
| `context-bar` | `on`, `off` | The status-line context progress bar (`/maestro:context-bar`). |

The frontier models and presets above are not a second list maintained here:
`/maestro:settings` and the table are both driven by
`node settings/cli.cjs list`, which sources them from `frontier/config.cjs`,
so they cannot drift from what the engine accepts.

`compress` is an action that transforms a file, not a persisted toggle, so
it is not part of settings.

## Claude Code: the keyboard picker

Run `/maestro:settings`. It reads the current values and the catalog of
available values through the CLI, then uses the agent's `AskUserQuestion`
tool — Claude Code's keyboard selector — to let you flip each toggle with the
arrow keys. This is the `AskUserQuestion` picker, not the built-in `/model`
widget: Claude Code does not let a plugin render that one, and a slash command
cannot open a raw-terminal menu on its own, so `AskUserQuestion` is the
in-REPL keyboard picker plugins get.

Because that picker shows at most four options per question, the frontier
choice is a short cascade — mode, then model or preset, then optional
judge/synth — so every model and preset is reachable without typing a name.
The option set always comes from `settings/cli.cjs list`, so it cannot drift
from what the frontier engine accepts. Each change is written back through the
CLI, which then prints a confirmation and the new status.

`/maestro:settings status` prints the current values without changing
anything.

## Codex and any other CLI: the portable command

Codex has no user-hook system, no `AskUserQuestion`, and no way for a plugin
to draw a picker, so Codex Desktop cannot host an interactive selector. That
is expected, not a missing feature. On Codex and any other agent, use the
CLI directly. It is the same writer the Claude Code command calls.

```text
node settings/cli.cjs status            # all three current values
node settings/cli.cjs status --json     # machine-readable
node settings/cli.cjs list              # every available value
node settings/cli.cjs list --json       # machine-readable catalog
node settings/cli.cjs set terse ultra
node settings/cli.cjs set context-bar off
node settings/cli.cjs set frontier fusion:opus-gpt
node settings/cli.cjs set frontier fusion:opus-gpt --judge opus --synth gpt-5.5
node settings/cli.cjs set frontier fusion:custom --models opus,gpt-5.5,gemini
node settings/cli.cjs set frontier single:opus
node settings/cli.cjs set frontier off
```

`set` validates against the same whitelists the existing toggles use and
exits non-zero with a message on bad input. The `frontier` key delegates to
`frontier/config.cjs`, so models and presets are validated exactly as
`/maestro:frontier` validates them.

## Where the state lives

Nothing is migrated. Each toggle is read from and written to its existing
store.

- **terse**: the durable level is `terseLevel` in
  `<configDir>/config.json`; the live session flag is
  `${CLAUDE_CONFIG_DIR or ~/.claude}/.maestro-terse`. `set terse` writes both,
  the same pairing the terse hook maintains at session start. If
  `MAESTRO_TERSE_LEVEL` is set in the environment, it overrides the file
  until unset, and `set terse` says so.
- **frontier**: `<configDir>/frontier-state.json`, read and written through
  `frontier/config.cjs`.
- **context-bar**: an empty `.context-bar-disabled` marker next to the
  status-line script named in `statusLine.command` in
  `${CLAUDE_CONFIG_DIR or ~/.claude}/settings.json`, defaulting to
  `~/.claude/statusline/`. Present means disabled, absent means enabled.

`<configDir>` is `$XDG_CONFIG_HOME/maestro`, else `%APPDATA%\maestro` on
Windows, else `~/.config/maestro`.

## Safety

Every write uses the same hardened pattern as the rest of the plugin:
create the directory, refuse a symlinked directory or target, write a temp
file opened with `O_EXCL` and `O_NOFOLLOW` at mode `0600`, then atomic
rename into place. Reads cap the byte length, refuse symlinks, and validate
against the whitelist before any value reaches your context or the status
line.
