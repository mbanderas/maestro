---
description: Maestro Frontier local multi-CLI fusion engine — compose or choose a read-only model panel, inspect the catalog, arm, disarm, or run it
argument-hint: "<off | single <model> | fusion <preset> | effort <level|auto> | compose --models <model>,<model> ... | catalog | status | run <prompt> | preset ... | roster>"
---

Drive the **Maestro Frontier** engine: a local multi-CLI fusion engine where a
parallel panel feeds a judge and grounded synthesis. When the user asks to
compose or choose a model panel, use `compose` after inspecting `catalog`; do
not guess model or preset IDs.

When the trusted Maestro Codex plugin hook is installed, a non-`off` mode makes
ordinary later Codex prompts auto-run through Frontier. `run` remains a manual
debug one-off. Map `$ARGUMENTS` to one engine CLI call from the repo root. Do
not edit Frontier state files by hand.

## Catalog and composition

```bash
maestro frontier catalog
maestro frontier catalog --json
maestro frontier compose --models <model>,<model> --dry-run --scope codex-project
maestro frontier compose --models <model>,<model> --judge <model> --synth <model> --effort <level> --scope codex-project
maestro frontier compose --models <model>,<model> --save <name> --scope codex-project
maestro frontier effort <auto|low|medium|high|xhigh|max|ultra> --scope codex-project
```

`frontier catalog` is the source of truth for models, presets, aliases,
readiness, and required configuration. `compose` accepts one to eight
comma-separated models. Judge and synth default to the first panel model.
`--dry-run` does not change state; a non-dry run saves and arms the resolved
custom fusion panel. Effort persists across panel, judge, and synth stages for
selected effort-aware Claude and Codex models; `effort auto` returns to
provider defaults.

## Modes, inspection, and one-off runs

```bash
maestro frontier mode off --scope codex-project
maestro frontier mode single --model <model> --scope codex-project
maestro frontier mode fusion --preset <preset> --scope codex-project
maestro frontier mode fusion --preset custom --models <model>,<model> --scope codex-project
maestro frontier status --scope codex-project
maestro frontier roster
maestro frontier preset save <name> --models <model>,<model> --judge <model> --synth <model> --scope codex-project
maestro frontier preset list --scope codex-project
maestro frontier preset delete <name> --scope codex-project
maestro frontier run "<prompt>" --scope codex-project
```

After a non-`off` mode is armed, use ordinary Codex prompts. For `run`, report
stdout verbatim. On `ERROR [<reason>]: <detail>`, relay the reason.

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
`MAESTRO_FRONTIER_MODEL_TERRA`, `MAESTRO_FRONTIER_MODEL_LUNA`, and
`MAESTRO_FRONTIER_MODEL_SOL` remain optional model-ID overrides. Codex Desktop
/ IDE sessions read overrides from `~/.codex/.env`; restart and open a new
thread after changing that file.

Before releasing Codex catalog changes, probe every first-party Codex selector:

```bash
node frontier/smoke.cjs
```

The explicit gate invokes those selectors through the normal read-only
dispatch path. All panel, judge, and synthesizer subprocesses are
one-shot and read-only: they return text only and never edit the workspace,
commit, or run autonomous loops.
