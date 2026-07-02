# Maestro Settings

One place to see and change Maestro's toggles. In Claude Code, run it with
arguments to change a toggle in one line, or with no arguments for a keyboard
picker; everywhere else a portable CLI does the same. The feature is a
front-end over Maestro's existing state; it stores nothing of its own, so the
terse hook, the frontier engine, the context-bar scripts, the discipline
enforcement hooks, and the verify-gate Stop hook keep reading exactly what
they read today.

The design and the staff-engineer review are recorded in
[`settings-design.md`](settings-design.md).

## What it covers

| Toggle | Values | What it controls |
|---|---|---|
| `terse` | `off`, `lite`, `full`, `ultra` | Output-token reduction (`/maestro:terse`). |
| `frontier` | `off`; `single:` `opus` / `fable` / `sonnet-5` / `gpt-5.5` / `gemini` / `glm` / `kimi` / `deepseek`; `fusion:` `opus-duo` / `opus-gpt` / `chatgpt-duo` / `frontier-trio` / `fable-duo` / `fable-gpt` / `fable-trio` / `sonnet-duo` / `sonnet-gpt` / `sonnet-trio` / `frontier-quad` / `frontier-quint` / `budget-trio` / `east-west` / `custom`, each with optional `--judge` / `--synth` | The local multi-CLI fusion engine (`/maestro:frontier`). Any non-`off` value arms auto-run: every prompt is routed through the engine and the answer relayed; `off` disables it. Arming/running a Fable panel past 2026-07-07 prints a non-blocking `[frontier] …` Usage-Credits cost advisory. |
| `context-bar` | `on`, `off` | The status-line context progress bar (`/maestro:context-bar`). |
| `discipline` | `on`, `off` | The discipline enforcement-hook pack (gate-reminder, doctrine-guard, phase-scope, subagent-guard, verify-gate, loop-guard, gate-telemetry, toolbudget). `off` makes every hook no-op — the runtime counterpart to `frontier off` for users who want only the engine. The doctrine TEXT (`AGENTS.md` kernel) is autoloaded at session start and cannot be unloaded mid-session, so the toggle covers the hook half only; install `--engine-only` to omit the kernel entirely. |
| `verify` | `off`, `warn`, `block` | The S7.3 verify-gate Stop hook (`hooks/maestro-verify-gate.cjs`). `warn` (default) injects a non-blocking nudge when a session modified files but ran no checker and stated no honest status token; `block` blocks the Stop once to force a checker run or honest token (`VERIFIED` with no checker still fires); `off` disables. Arm `block` per-repo where a real test suite exists. |

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

## Claude Code: direct commands

Pass arguments and `/maestro:settings` runs the change immediately — no
questionnaire. The first argument selects the action:

| You type | What runs |
|---|---|
| `/maestro:settings` | the keyboard picker (above) |
| `/maestro:settings status` | print current values |
| `/maestro:settings list` | print every available value |
| `/maestro:settings help` | usage grammar + the full matrix |
| `/maestro:settings set terse off` | set a toggle |
| `/maestro:settings terse off` | shorthand for `set terse off` |
| `/maestro:settings frontier fusion opus-gpt` | `set frontier fusion:opus-gpt` |
| `/maestro:settings frontier fusion custom --models opus,gpt-5.5,gemini` | a custom panel |
| `/maestro:settings frontier fusion opus-gpt --judge opus --synth gpt-5.5` | with stage overrides |
| `/maestro:settings context-bar off` | hide the context bar |
| `/maestro:settings discipline off` | silence the enforcement-hook pack |
| `/maestro:settings verify block` | enforce the verify-gate (block on unverified Stop) |

The friendly space form (`frontier fusion opus-gpt`) is normalized to the
CLI's colon form (`fusion:opus-gpt`); the colon form works too. The
`argument-hint` shows the grammar as you type — Claude Code has no per-value
tab-completion for command arguments, so the hint plus `help` is the discovery
path.

## Codex and any other CLI: the portable command

Codex does not expose Claude Code's `AskUserQuestion` picker UI, so Codex
Desktop cannot host this interactive selector. That is expected, not a
missing feature. On Codex and any other agent, use the CLI directly. It is
the same writer the Claude Code command calls.

```text
node settings/cli.cjs status            # all current values
node settings/cli.cjs status --json     # machine-readable
node settings/cli.cjs help              # usage grammar + every available value
node settings/cli.cjs list              # every available value
node settings/cli.cjs list --json       # machine-readable catalog
node settings/cli.cjs set terse ultra
node settings/cli.cjs set context-bar off
node settings/cli.cjs set discipline off
node settings/cli.cjs set verify block
node settings/cli.cjs set frontier fusion:opus-gpt
node settings/cli.cjs set frontier fusion:chatgpt-duo --scope codex-project
node settings/cli.cjs set frontier fusion:budget-trio --scope codex-project
node settings/cli.cjs set frontier fusion:east-west --scope codex-project
node settings/cli.cjs set frontier fusion:frontier-trio --judge chatgpt --synth chatgpt --scope codex-project
node settings/cli.cjs set frontier fusion:custom --models kimi,gpt-5.5,deepseek
node settings/cli.cjs set frontier single:opus
node settings/cli.cjs set frontier off --scope codex-project
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
- **frontier**: `<configDir>/frontier-state.<scope>.json`, read and written
  through `frontier/config.cjs`. Claude Code autodetect resolves to a
  per-workspace scope `cc-<8hex>` (SHA-256 of the git project root), so
  each workspace has its own state file. Codex plugin contexts resolve to
  a separate per-workspace `codex-<8hex>` scope. From a shell in the repo,
  pass `--scope codex-project` to resolve that same project scope.
  Project/workspace scope is the recommended default for repo installs;
  global/user scope is optional when you intentionally want shared state.
  Passing no scope outside a recognized runtime falls back to the legacy
  `frontier-state.json`.
- **context-bar**: an empty `.context-bar-disabled` marker next to the
  status-line script named in `statusLine.command` in
  `${CLAUDE_CONFIG_DIR or ~/.claude}/settings.json`, defaulting to
  `~/.claude/statusline/`. Present means disabled, absent means enabled.
- **discipline**: the boolean `discipline` key in `<configDir>/config.json`
  (the same file as `terseLevel`). Default on means the key is absent;
  `set discipline off` writes `discipline: false`. The enforcement hooks read
  it through `hooks/maestro-discipline-gate.cjs` (fail-safe: any read error =
  enabled). `MAESTRO_DISCIPLINE=off|on` in the environment overrides the file
  until unset, and `set discipline` says so.
- **verify**: the `verifyGate` key in `<configDir>/config.json` (same file as
  `terseLevel`). Default `warn` means the key is absent; `set verify block`/`off`
  writes it explicitly. The verify-gate Stop hook reads it through
  `settings/config.cjs` `readVerify` (fail-safe: any read error = `warn`).
  `MAESTRO_VERIFY_GATE=off|warn|block` (and `0` = off) overrides the file until
  unset, and `set verify` says so.

`<configDir>` is `$XDG_CONFIG_HOME/maestro`, else `%APPDATA%\maestro` on
Windows, else `~/.config/maestro`.

## Safety

Every write uses the same hardened pattern as the rest of the plugin:
create the directory, refuse a symlinked directory or target, write a temp
file opened with `O_EXCL` and `O_NOFOLLOW` at mode `0600`, then atomic
rename into place. Reads cap the byte length, refuse symlinks, and validate
against the whitelist before any value reaches your context or the status
line.

## Updating the installed plugin

`/maestro:settings` runs from the installed plugin cache. After a new release,
refresh it so the new command and CLI load:

```text
/plugin marketplace update maestro
/reload-plugins
```

Codex plugin installs are refreshed with:

```text
codex plugin marketplace upgrade maestro
codex plugin add maestro@maestro
```

Portable/manual Codex installs can still be refreshed by re-running
`maestro install --target codex` in the intended scope. The updater refreshes
Maestro-managed files, preserves user-edited files, and safely migrates older
unprefixed Codex skills to the current `maestro-frontier`,
`maestro-settings`, `maestro-terse`, and `maestro-update` names where possible.
