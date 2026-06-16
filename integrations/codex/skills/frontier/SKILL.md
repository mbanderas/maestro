---
name: frontier
description: Maestro Frontier local multi-CLI fusion engine — switch mode, or run a prompt through the panel
---

Drive the **Maestro Frontier** engine — a zero-dependency local multi-CLI fusion
engine (a parallel panel of local CLIs → a judge model's analysis → a grounded
synthesis). It is the same engine the Claude Code plugin ships; here it runs
through the `maestro` CLI with `--scope codex`.

**This is a typing shortcut, not a prompt hook.** Codex has no automatic
prompt hook, so arming a mode does **not** auto-run the engine on later prompts —
it only persists the mode. To actually fuse a prompt, invoke `run` explicitly
(step 3).

Map the user's request to one engine CLI call and run it from the repo root.
Do not edit the engine's state file by hand.

## 1. Switch mode

Persists to `~/.config/maestro/frontier-state.codex.json`; default `off`.
`--scope codex` keeps Codex's armed mode independent from Claude Code, Cline,
Cursor, and Gemini on the same machine:

```bash
maestro frontier mode off --scope codex
maestro frontier mode single --model <model> --scope codex
maestro frontier mode fusion --preset <preset> --scope codex
maestro frontier mode fusion --preset custom --models <a,b,c> --scope codex
maestro frontier mode fusion --preset <preset> --judge <model> --synth <model> --scope codex
```

Models: `opus` (Claude Opus 4.8, needs `claude`), `gpt-5.5` (needs `codex`),
`gemini` (needs `gemini`). Presets: `opus-duo`, `opus-gpt`, `gpt-duo`,
`frontier-trio`, `custom`. Judge + synth default to Opus; `--judge`/`--synth`
override for any preset (e.g. `--judge opus --synth gpt-5.5`). `gpt-duo` runs
judge + synth on GPT-5.5 — a Codex-only fusion that needs no `claude`.

## 2. Show current mode/preset

```bash
maestro frontier status --scope codex
```

## 3. Run a prompt through the current mode

This is the action that actually fuses, since nothing auto-runs here. Set a
mode first (step 1), then:

```bash
maestro frontier run "<prompt>" --scope codex
```

- `off`: prints a notice, spawns nothing.
- `single`: dispatches the one selected CLI, prints its answer.
- `fusion`: runs the panel in parallel → judge → synthesizer; prints the final
  answer (a one-line run meta goes to stderr). Report stdout verbatim.

On error the engine prints `ERROR [<reason>]: <detail>` to stderr and exits
non-zero — relay the reason.

## Indicator instruction

<!-- INDICATOR INSTRUCTION — apply every turn while this skill is active -->

Before composing your first reply each turn, run:

```bash
maestro frontier status --scope codex
```

Parse the returned JSON `mode` field:

- If `mode` is not `off`, make the **first line** of your reply exactly:
  `Maestro Frontier ON (<label>)`
  where `<label>` is formed as follows:
  - single mode → `single · <model>` (e.g. `single · opus`)
  - fusion mode → `fusion · <preset>` (e.g. `fusion · frontier-trio`);
    for a custom preset use `fusion · custom (<model1>, <model2>, ...)`
- If `mode` is `off`, output no indicator line.

<!-- END INDICATOR INSTRUCTION -->

## Notes

- Real `single`/`fusion` runs spawn local CLIs and cost tokens; use small prompts.
  `off` is free.
- Each model's CLI must be on `PATH`, or point at a specific build with
  `MAESTRO_CLAUDE_BIN` / `MAESTRO_CODEX_BIN` / `MAESTRO_GEMINI_BIN`.
- Requires `maestro` on `PATH` (installed during Maestro setup). If it is
  missing, install Maestro first.
