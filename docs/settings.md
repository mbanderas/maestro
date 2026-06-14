# Maestro Settings

One place to see and change Maestro's toggles. Interactive in Claude Code
with a keyboard picker like `/model`, and a portable CLI everywhere else.
The feature is a front-end over Maestro's existing state; it stores nothing
of its own, so the terse hook, the frontier engine, and the context-bar
scripts keep reading exactly what they read today.

The design and the staff-engineer review are recorded in
[`settings-design.md`](settings-design.md).

## What it covers

| Toggle | Values | What it controls |
|---|---|---|
| `terse` | `off`, `lite`, `full`, `ultra` | Output-token reduction (`/maestro:terse`). |
| `frontier` | `off`, `single:<model>`, `fusion:<preset>` | The local multi-CLI fusion engine (`/maestro:frontier`). |
| `context-bar` | `on`, `off` | The status-line context progress bar (`/maestro:context-bar`). |

`compress` is an action that transforms a file, not a persisted toggle, so
it is not part of settings.

## Claude Code: the keyboard picker

Run `/maestro:settings`. The command reads every current value through the
CLI, then uses the agent's `AskUserQuestion` tool to let you flip each
toggle with the arrow keys and space, the same interaction as the native
`/model` selector. Each change is written back through the CLI, and the
command prints a confirmation and the new status.

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
node settings/cli.cjs set terse ultra
node settings/cli.cjs set context-bar off
node settings/cli.cjs set frontier fusion:opus-gpt
node settings/cli.cjs set frontier fusion:opus-gpt --judge opus --synth gpt-5.5
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
