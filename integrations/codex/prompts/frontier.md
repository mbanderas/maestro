---
description: Maestro Frontier local multi-CLI fusion engine — compose or choose a read-only model panel, inspect the catalog, arm, disarm, or run it
argument-hint: "<off | single <model> | fusion <preset> | compose --models <model>,<model> ... | catalog | status | run <prompt> | preset ... | roster>"
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
maestro frontier compose --models <model>,<model> --judge <model> --synth <model> --scope codex-project
maestro frontier compose --models <model>,<model> --save <name> --scope codex-project
```

`frontier catalog` is the source of truth for models, presets, aliases,
readiness, and required configuration. `compose` accepts one to eight
comma-separated models. Judge and synth default to the first panel model.
`--dry-run` does not change state; a non-dry run saves and arms the resolved
custom fusion panel.

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

## Configuration and release gate

Configure optional Codex aliases only with
`MAESTRO_FRONTIER_MODEL_TERRA`, `MAESTRO_FRONTIER_MODEL_LUNA`, and
`MAESTRO_FRONTIER_MODEL_SOL`. Codex Desktop / IDE sessions read them from
`~/.codex/.env`; restart and open a new thread after changing that file.

Before releasing configured optional Codex aliases, run:

```bash
node frontier/smoke.cjs
```

The explicit gate invokes only configured optional aliases through the normal
read-only dispatch path. All panel, judge, and synthesizer subprocesses are
one-shot and read-only: they return text only and never edit the workspace,
commit, or run autonomous loops.
