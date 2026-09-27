---
description: Maestro Frontier local multi-CLI engine: arm or disarm it, inspect the catalog, or compose and choose a read-only model panel
argument-hint: "<off | single <model> | fusion <preset> | effort <level|auto> | compose --models <model>,<model> ... | catalog | status | run <prompt> | adopt | preset ... | roster>"
allowed-tools: Bash, Read
---

Drive the Maestro Frontier engine: a local multi-CLI fusion engine where a
panel feeds a judge and synthesizer. It is opt-in: `off` is the default, while
arming `single` or `fusion` makes ordinary later prompts auto-run through
Frontier. Plugin/slash-command prompts (for example, `/maestro:frontier off`)
bypass autorun because they are host directives.

When the user asks to **compose** or **choose a model panel**, route that
request to `compose`; do not guess model or preset IDs. Start with `catalog`.

Requested action: `$ARGUMENTS`

Map the argument to one engine CLI call and run it. Do not edit Frontier state
files by hand.

## Modes

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/maestro.cjs" frontier mode off
node "${CLAUDE_PLUGIN_ROOT}/bin/maestro.cjs" frontier mode single --model <model> [--effort <level>]
node "${CLAUDE_PLUGIN_ROOT}/bin/maestro.cjs" frontier mode fusion --preset <preset> [--effort <level>]
node "${CLAUDE_PLUGIN_ROOT}/bin/maestro.cjs" frontier mode fusion --preset custom --models <model>,<model> [--effort <level>]
```

Use `mode` for a known catalog model or preset. For a custom panel, prefer
`compose` below because it validates readiness before it arms the panel.

## Catalog and composition

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/maestro.cjs" frontier catalog
node "${CLAUDE_PLUGIN_ROOT}/bin/maestro.cjs" frontier catalog --json
node "${CLAUDE_PLUGIN_ROOT}/bin/maestro.cjs" frontier compose --models <model>,<model> --dry-run
node "${CLAUDE_PLUGIN_ROOT}/bin/maestro.cjs" frontier compose --models <model>,<model> --judge <model> --synth <model> --effort <level>
node "${CLAUDE_PLUGIN_ROOT}/bin/maestro.cjs" frontier compose --models <model>,<model> --save <name>
node "${CLAUDE_PLUGIN_ROOT}/bin/maestro.cjs" frontier effort <auto|low|medium|high|xhigh|max|ultra>
```

`frontier catalog` is the source of truth for selectable models, presets,
aliases, readiness, and required configuration. Do not list or invent model
IDs in this command. `compose` accepts one to eight comma-separated models;
`--judge` and `--synth` default to the first panel model. `--dry-run` validates
without changing state; otherwise `compose` arms the `custom` fusion panel.
`--effort` persists one validated level for all selected effort-aware Claude
and Codex members. `frontier effort auto` returns an armed panel to provider
defaults.

## Inspect, saved presets, and one-off runs

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/maestro.cjs" frontier status
node "${CLAUDE_PLUGIN_ROOT}/bin/maestro.cjs" frontier roster
node "${CLAUDE_PLUGIN_ROOT}/bin/maestro.cjs" frontier preset save <name> --models <model>,<model> --judge <model> --synth <model>
node "${CLAUDE_PLUGIN_ROOT}/bin/maestro.cjs" frontier preset list
node "${CLAUDE_PLUGIN_ROOT}/bin/maestro.cjs" frontier preset delete <name>
node "${CLAUDE_PLUGIN_ROOT}/bin/maestro.cjs" frontier run "<prompt>"
node "${CLAUDE_PLUGIN_ROOT}/bin/maestro.cjs" frontier adopt
node "${CLAUDE_PLUGIN_ROOT}/bin/maestro.cjs" frontier adopt --force
```

`roster` reports readiness without secret values. Saved presets persist in the
current scope. `run` is a manual one-off; an armed mode already handles normal
prompts. `adopt` copies a previously armed legacy global state into this Claude
Code workspace only when explicitly requested.

## Current models, overrides, and release gate

`opus` pins Claude Opus 5.5 (`claude-opus-5-5`), `fable` pins Fable 5.1
(`claude-fable-5-1`), `sonnet-5` keeps Sonnet 5 (`claude-sonnet-5`), and
`haiku` adds Haiku 4.5 (`claude-haiku-4-5-20251001`). Claude Code v2.1.280+
is required for Opus 5.5; v2.1.257+ is required for Fable 5.1.
Opus, Fable, and Sonnet support `low`, `medium`, `high`, `xhigh`, and `max`;
Haiku has no effort flag.
Codex selectors include `astra` (`gpt-6-astra`), `sol` (`gpt-6-sol`),
`terra` (`gpt-5.6-terra`), and `luna` (`gpt-6-luna`), plus `auto-review` and
the retained GPT-5.5, GPT-5.4, GPT-5.4 Mini, and GPT-5.3 Codex Spark selectors.
GPT-6 models support `low`, `medium`, `high`, `xhigh`, and `max` in Maestro’s
UI, without `none` or `ultra`. Earlier explicit selectors and third-party
adapters remain available.
Use `frontier catalog` for exact aliases and supported effort levels.
`MAESTRO_FRONTIER_MODEL_TERRA`, `MAESTRO_FRONTIER_MODEL_LUNA`, and
`MAESTRO_FRONTIER_MODEL_SOL` remain optional model-ID overrides. For Codex
Desktop, place overrides in `~/.codex/.env` and restart/open a new thread.
The catalog never reveals override values.

Before releasing Codex catalog changes, run the explicit smoke gate. It probes
every first-party Codex selector:

```bash
node "${CLAUDE_PLUGIN_ROOT}/frontier/smoke.cjs"
```

It invokes those selectors through their normal read-only dispatch path.

## Safety and reporting

All Frontier panel, judge, and synthesizer subprocesses are one-shot and
read-only; they emit a response and never edit the workspace, commit, or run an
autonomous loop. They are separate from in-session multi-agent orchestration.

- For `catalog`, summarize readiness and configuration names only; never print
  secret or configured model values.
- For `compose --dry-run`, report the resolved panel and that state is
  unchanged. For a non-dry composition or mode arm, confirm that later ordinary
  prompts auto-run through Frontier.
- For `roster`, summarize blocked adapters by missing binary or configuration,
  without asking for or printing secrets.
- For `run`, report stdout verbatim. On `ERROR [<reason>]: <detail>`, relay the
  reason.
- For `off`, confirm that auto-run is disabled. For `status`, report the active
  mode and preset.
