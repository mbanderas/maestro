---
name: maestro-frontier
description: Maestro Frontier local multi-CLI fusion engine - arm, disarm, inspect, or debug-run the panel
---

Drive the **Maestro Frontier** engine: a zero-dependency local multi-CLI fusion
engine where a parallel panel of local CLIs feeds a judge model's analysis and a
grounded synthesis.

When the Maestro Codex plugin hook is installed, enabled, and trusted, arming a
non-`off` mode makes normal later Codex prompts auto-run through Frontier until
you turn it off. Users should not need to type `maestro frontier run "<prompt>"`
for normal use.

Map the user's request to one engine CLI call and run it from the repo root.
Do not edit the engine's state file by hand.

## 1. Switch mode

Project/workspace scope is the default recommendation. Use `--scope
codex-project` from the repository root; the CLI expands it to the same
`codex-<8hex>` workspace scope the Codex plugin hook resolves from
`PLUGIN_ROOT` / `PLUGIN_DATA`. Default mode is `off`.

```bash
maestro frontier mode off --scope codex-project
maestro frontier mode single --model <model> --scope codex-project
maestro frontier mode fusion --preset chatgpt-duo --scope codex-project
maestro frontier mode fusion --preset frontier-trio --judge chatgpt --synth chatgpt --scope codex-project
maestro frontier mode fusion --preset custom --models <a,b,c> --scope codex-project
```

Models: `opus` (Claude Opus 4.8, needs `claude`), `gpt-5.5` (needs `codex`),
`gemini` (needs `gemini`). Presets: `opus-duo`, `opus-gpt`, `gpt-duo`,
`frontier-trio`, `custom`. Friendly aliases are accepted: `chatgpt` maps to
`gpt-5.5`, and `chatgpt-duo` maps to `gpt-duo`.

Judge + synth default to Opus except for presets with explicit stage defaults.
Override them for mixed panels with `--judge <model>` and `--synth <model>`;
for example, `--judge chatgpt --synth chatgpt`.

## 2. Show current mode/preset

```bash
maestro frontier status --scope codex-project
```

If you intentionally want one shared Codex state across unrelated repos, choose
an explicit global name such as `--scope codex-global`. Do not use global scope
unless that cross-repo behavior is what you want.

## 3. Normal use after arming

After mode is non-`off`, type ordinary Codex prompts. The trusted Codex hook
auto-runs Frontier and injects the synthesized answer as context for the live
reply. Turn it off with:

```bash
maestro frontier mode off --scope codex-project
```

## 4. Advanced/debug one-off run

Manual one-off execution remains available for debugging:

```bash
maestro frontier run "<prompt>" --scope codex-project
```

- `off`: prints a notice, spawns nothing.
- `single`: dispatches the one selected CLI, prints its answer.
- `fusion`: runs the panel in parallel, then judge, then synthesizer; prints
  the final answer (a one-line run meta goes to stderr). Report stdout verbatim.

On error the engine prints `ERROR [<reason>]: <detail>` to stderr and exits
non-zero; relay the reason.

## Indicator instruction

<!-- INDICATOR INSTRUCTION - apply every turn while this skill is active -->

Before composing your first reply each turn, run:

```bash
maestro frontier status --scope codex-project
```

Parse the returned JSON `mode` field:

- If `mode` is not `off`, make the **first line** of your reply exactly:
  `Maestro Frontier ON (<label>)`
  where `<label>` is formed as follows:
  - single mode -> `single - <model>` (e.g. `single - opus`)
  - fusion mode -> `fusion - <preset>` (e.g. `fusion - frontier-trio`);
    for a custom preset use `fusion - custom (<model1>, <model2>, ...)`
- If `mode` is `off`, output no indicator line.

<!-- END INDICATOR INSTRUCTION -->

## Notes

- Real `single`/`fusion` runs spawn local CLIs and cost tokens; `off` is free.
- The autorun hook no-ops when `FUSION_DEPTH >= 1`, so child `codex`, `claude`,
  and `gemini` panel processes do not recursively run Frontier.
- Each model's CLI must be on `PATH`, or point at a specific build with
  `MAESTRO_CLAUDE_BIN` / `MAESTRO_CODEX_BIN` / `MAESTRO_GEMINI_BIN`.
- Requires `maestro` on `PATH` (installed during Maestro setup). If it is
  missing, install Maestro first.
