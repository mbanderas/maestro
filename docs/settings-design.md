# Maestro Settings: Design and Plan

A unified front-end for Maestro's existing toggles. Interactive in Claude
Code (a keyboard picker like `/model`), and a portable CLI for Codex and
any other agent. This document is the design and the implementation plan.

## The problem

Maestro ships three real toggles, each with its own state file, its own
reader, and its own switch command:

- **terse** (`/maestro:terse off|lite|full|ultra`): output-token reduction.
- **frontier** (`/maestro:frontier off | single <model> | fusion <preset>`):
  the local multi-CLI fusion engine.
- **context-bar** (`/maestro:context-bar on|off`): the status-line context
  progress bar.

There is no single place to see all three at once, and no single command to
change any of them from a non-Claude agent. A Codex user who wants to flip
the frontier mode has to know the exact `node frontier/cli.cjs` incantation;
a user who wants to see every current Maestro setting has to inspect three
different files in two different directories. This feature adds one view and
one writer over the three existing stores.

`/maestro:compress <file>` is deliberately out of scope. It is an action
that transforms a file, not a persisted toggle, so it has no state to show
or set.

## Load-bearing assumptions

1. The three existing readers (the terse hook, the frontier config module,
   the context-bar status scripts) stay the source of truth. The settings
   feature is a front-end over their state, never a replacement store. If
   this feature wrote its own aggregated file, the existing readers would
   not see it and the views would desync. This is the central constraint.
2. A Claude Code slash command is a markdown prompt the agent executes, not
   a program. The only keyboard picker a plugin can drive is the agent's
   `AskUserQuestion` tool, which renders arrow-key and space multi-choice in
   Claude Code. That is the `/model`-like surface, and the command uses it.
3. Codex has no user-hook system, no `AskUserQuestion`, and no way for a
   plugin to inject a TUI. Codex Desktop therefore cannot host an
   interactive picker. On Codex the settings surface is the CLI plus a
   command doc, and that is the correct ceiling, not a gap to work around.
4. Zero new npm dependencies. The module is CommonJS `.cjs`, matching the
   rest of the plugin's machinery.

## The state model (reused, not migrated)

Config directory, identical to `frontier/config.cjs` and the terse hook:
`$XDG_CONFIG_HOME/maestro`, else `%APPDATA%\maestro` on Windows, else
`~/.config/maestro`.

| Toggle | Store | Owner / reader | Whitelist |
|---|---|---|---|
| terse | `<configDir>/config.json` key `terseLevel` (durable) plus the live flag `${CLAUDE_CONFIG_DIR or ~/.claude}/.maestro-terse` | `hooks/maestro-terse-mode.cjs` | `off`, `lite`, `full`, `ultra` |
| frontier | `<configDir>/frontier-state.json` | `frontier/config.cjs` | mode `off`/`single`/`fusion`; model and preset validated by the frontier config |
| context-bar | `.context-bar-disabled` in the status-line script directory | `statusline/context-bar.ps1` and `.sh` | present (disabled) or absent (enabled) |

Three details drive the implementation.

**terse has two stores.** The durable setting is `terseLevel` in
`config.json`; the hook reads it at session start (`env MAESTRO_TERSE_LEVEL`
overrides it, then `config.json`, then `off`) and writes the live flag from
it. The flag alone is session-scoped. So a durable settings change writes
`config.json.terseLevel` and mirrors the live flag, which is exactly the
pairing the hook maintains at session start. Reading reports the resolved
level (`env` over `config` over `off`) and flags an active `env` override.
When `MAESTRO_TERSE_LEVEL` is set to a recognized level (`off`, `lite`,
`full`, or `ultra`) in the environment, a `set terse` write to `config.json`
is overridden at the next session start, because the hook honors that
variable before reading the file. The CLI warns on `set` that the write will
not take effect while the override is active. The override is never silent.

**frontier already has a hardened module.** `frontier/config.cjs` exports
`loadState`, `saveState`, `validateMode`, `validatePreset`,
`validateModel`, and `DEFAULTS`. The settings module requires it directly
rather than re-implementing any of it. One source of truth, no duplication.

**context-bar lives next to the running status-line script.** Both
`context-bar.ps1` and `context-bar.sh` test the flag only at their own
directory (`$PSScriptRoot` and `$script_dir`), so the flag must sit beside
whichever script `statusLine.command` actually runs, which is not
necessarily the plugin's own `statusline/` directory. The settings module
resolves that directory deterministically in code, with no agent in the
loop:

1. Read `${CLAUDE_CONFIG_DIR or ~/.claude}/settings.json` and parse it as
   JSON.
2. Take `statusLine.command` (a string, or the `command` field when
   `statusLine` is an object), split on whitespace, and use the first token
   that looks like a path. `path.dirname` of that token is the script
   directory.
3. If `settings.json` is absent or unparseable, or `statusLine.command` is
   missing, fall back to `${CLAUDE_CONFIG_DIR or ~/.claude}/statusline`.
4. If the resolved command exists but its basename is not a `context-bar`
   script, the module still uses its directory but `status` and `set` warn
   that the status line may not be the Maestro bar, so a flag is never
   written silently to a directory the bar will never read.

This is the same resolution the `/context-bar` command performs, expressed
as a code path the CLI runs unaided rather than as agent behavior.

## Security

Every write matches the hardened pattern already in `frontier/config.cjs`
and the terse hook: create the directory recursively, refuse a symlinked
directory or target via `lstat`, write to a temp file opened with
`O_EXCL | O_NOFOLLOW` at mode `0600`, then atomic-rename into place. Reads
of the terse flag and `config.json` cap the byte length, refuse symlinks,
and validate against the whitelist before any value reaches the model's
context or the status line. No value is ever echoed into context unchecked.
The context-bar flag is an empty marker, created with the same
symlink-refusing temp-and-rename and removed with a plain unlink.

## Claude Code surface: the interactive picker

`/maestro:settings` is a markdown command. Its body instructs the agent to:

1. Run `node <pluginRoot>/settings/cli.cjs status --json` to read every
   current value through the one reader.
2. Present each toggle with `AskUserQuestion`, pre-selecting the current
   value, so the user flips it with the keyboard exactly like `/model`.
3. Write each change back with `node settings/cli.cjs set <key> <value>`,
   which validates and persists through the existing writers.
4. Print a one-line confirmation per change.

The command never edits state files directly. The CLI is the only writer, so
the interactive path and the Codex path share one validated code path.

## Codex and other CLIs: the portable surface

`node settings/cli.cjs status` prints all three current values as text;
`--json` prints a machine-readable object. `node settings/cli.cjs set <key>
<value>` changes one toggle, validating against the same whitelists and
writing through the same hardened state I/O. Keys are `terse`, `frontier`,
and `context-bar`. The frontier key accepts `off`, `single:<model>`,
`fusion:<preset>`, with optional `--judge`/`--synth`, delegating validation
to `frontier/config.cjs`.

On Codex (including Codex Desktop) this CLI is the whole surface. There is no
picker because Codex cannot host one. `commands/settings.md` documents the
CLI path for Codex users so the limitation is stated, not hidden.

## What is explicitly not built

- No new aggregated state file. The three stores stay authoritative.
- No Codex TUI or picker. The CLI is the ceiling there.
- No `compress` toggle. It is an action with no persisted state.
- No migration of existing state. Existing readers keep reading what they
  read today.

## Implementation plan

Phases are ordered, each at most five files, verified before the next.

### B3a: the aggregating module (2 files)

- `settings/config.cjs`: `readAll()` returns `{ terse, frontier,
  contextBar }` resolved from the three stores; `setTerse(level)`,
  `setFrontier(spec)`, `setContextBar(enabled)` write through the existing
  writers (`frontier/config.cjs` required directly; terse `config.json` plus
  flag; context-bar marker). Hardened I/O ported from `frontier/config.cjs`.
  Config-dir and status-line-dir resolvers included. Under 400 lines,
  functions under 50.
- `settings/config.test.cjs`: round-trip each toggle against a temp
  `XDG_CONFIG_HOME` and `CLAUDE_CONFIG_DIR`; assert reads reflect writes,
  whitelists reject bad input, symlinked targets are refused, and the
  frontier path delegates to `frontier/config.cjs` without desync.

Acceptance: `node --check` clean; `node settings/config.test.cjs` passes.

### B3b: the portable CLI (2 files)

- `settings/cli.cjs`: `status` (text and `--json`) and `set <key> <value>`,
  validating keys and values, exiting non-zero with a clear message on bad
  input. Mirrors the argument style of `frontier/cli.cjs`.
- `settings/cli.test.cjs`: spawn the CLI for a `status` then `set` then
  `status` round-trip; assert the second status reflects the set and that
  the frontier store on disk matches what `frontier/config.cjs` reads.

Acceptance: `node --check` clean; CLI test passes; a manual `status` then
`set` then `status` round-trip is verified by running it.

### B3c: command and docs (3 files)

- `commands/settings.md`: the `/maestro:settings` interactive command, using
  `AskUserQuestion` and writing through the CLI. Em-dash-free.
- `docs/settings.md`: user documentation covering the picker, the CLI, and
  the Codex path with the explicit no-picker statement. Em-dash-free.
- `README.md`: one bullet under "Claude Code Tools" pointing at the feature
  and `docs/settings.md`. Em-dash-free.

Acceptance: markdownlint clean for the new docs under the repo config; no
em-dash outside code; the README bullet links resolve.

### B4: verify and staff review

`node --check` every new `.cjs`; run every `*.test.cjs`; run the CLI
round-trip for real; confirm the existing terse hook, frontier module, and
context-bar scripts still read the same state (no desync). Then a
fresh-context Staff Engineer reviews the integrated diff against the
requirements.

## Harness-mutation note (S10)

- Component: `settings/` module and CLI, `commands/settings.md`,
  `docs/settings.md`, README bullet.
- Targeted failure mode: scattered toggles with no unified view or portable
  writer; a Codex user cannot change a setting without memorizing internal
  CLI paths.
- Predicted improvement: one read view and one validated writer over the
  three existing stores, interactive in Claude Code and portable elsewhere.
- Falsifying check: a `status` then `set` then `status` round-trip that the
  existing readers also observe; if any existing reader sees stale state,
  the design has desynced and fails.
- Rollback path: delete `settings/`, `commands/settings.md`,
  `docs/settings.md`, and the README bullet. The three existing toggles are
  untouched and keep working.
