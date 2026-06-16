---
description: Maestro Frontier local multi-CLI fusion engine — arm, disarm, inspect, or debug-run the panel
argument-hint: "<off | single <model> | fusion <preset> | status | run <prompt>>"
---

Drive the **Maestro Frontier** engine — a zero-dependency local multi-CLI fusion
engine (a parallel panel of local CLIs → a judge model's analysis → a grounded
synthesis). It is the same engine the Claude Code plugin ships; here it runs
through the `maestro` CLI, installed into this repo during setup.

When the Maestro Codex plugin hook is installed, enabled, and trusted, arming a
non-`off` mode makes ordinary later Codex prompts auto-run through Frontier
until disabled. Manual `run` remains available for advanced/debug one-offs.

Requested action: `$ARGUMENTS`

Map it to one engine CLI call and run it from the repo root. Do not edit
the engine's state file by hand.

1. Switch mode. Project/workspace scope is the default recommendation. Run from
   the repo root with `--scope codex-project`; the CLI expands it to the same
   `codex-<8hex>` scope the trusted Codex hook uses:

   ```bash
   maestro frontier mode off --scope codex-project
   maestro frontier mode single --model <model> --scope codex-project
   maestro frontier mode fusion --preset chatgpt-duo --scope codex-project
   maestro frontier mode fusion --preset frontier-trio --judge chatgpt --synth chatgpt --scope codex-project
   maestro frontier mode fusion --preset custom --models <a,b,c> --scope codex-project
   ```

   Models: `opus` (Claude Opus 4.8, needs `claude`), `gpt-5.5` (needs `codex`),
   `gemini` (needs `gemini`). Presets: `opus-duo`, `opus-gpt`, `gpt-duo`,
   `frontier-trio`, `custom`. Judge + synth default to Opus; `--judge`/`--synth`
   override for any preset (e.g. `--judge opus --synth gpt-5.5`). `gpt-duo` runs
   judge + synth on GPT-5.5 — a Codex-only fusion that needs no `claude`.
   Friendly aliases are accepted: `chatgpt` -> `gpt-5.5`, and `chatgpt-duo` ->
   `gpt-duo`.

2. Show the current mode/preset:

   ```bash
   maestro frontier status --scope codex-project
   ```

3. Normal use after arming: type ordinary Codex prompts. The trusted hook
   auto-runs Frontier and injects the synthesized answer as context.

4. Advanced/debug one-off run:

   ```bash
   maestro frontier run "<prompt>" --scope codex-project
   ```

   - `off`: prints a notice, spawns nothing.
   - `single`: dispatches the one selected CLI, prints its answer.
   - `fusion`: runs the panel in parallel → judge → synthesizer; prints the final
     answer (a one-line run meta goes to stderr). Report stdout verbatim.

On error the engine prints `ERROR [<reason>]: <detail>` to stderr and exits
non-zero — relay the reason.

Notes:

- Real `single`/`fusion` runs spawn local CLIs and cost tokens; use small prompts.
  `off` is free.
- Each model's CLI must be on `PATH`, or point at a specific build with
  `MAESTRO_CLAUDE_BIN` / `MAESTRO_CODEX_BIN` / `MAESTRO_GEMINI_BIN`.
- Requires `maestro` on `PATH` (installed during Maestro setup). If it is missing,
  install Maestro first.
