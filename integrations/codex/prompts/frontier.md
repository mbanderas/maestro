---
description: Maestro Frontier local multi-CLI fusion engine — switch mode, or run a prompt through the panel
argument-hint: "<off | single <model> | fusion <preset> | status | run <prompt>>"
---

Drive the **Maestro Frontier** engine — a zero-dependency local multi-CLI fusion
engine (a parallel panel of local CLIs → a judge model's analysis → a grounded
synthesis). It is the same engine the Claude Code plugin ships; here it runs as a
plain Node CLI at `frontier/cli.cjs`, copied into this repo during install.

**This is a typing shortcut, not the Claude Code plugin.** Codex has no
prompt hook, so arming a mode does **not** auto-run the engine on later prompts —
it only persists the mode. To actually fuse a prompt, invoke `run` explicitly
(step 3).

Requested action: `$ARGUMENTS`

Map it to one engine CLI call and run it from the repo root (where `frontier/` was
installed). Do not edit the engine's state file by hand.

1. Switch mode (persists to `~/.config/maestro/frontier-state.json`; default `off`):

   ```bash
   node frontier/cli.cjs mode off
   node frontier/cli.cjs mode single --model <model>
   node frontier/cli.cjs mode fusion --preset <preset>
   node frontier/cli.cjs mode fusion --preset custom --models <a,b,c>
   node frontier/cli.cjs mode fusion --preset <preset> --judge <model> --synth <model>
   ```

   Models: `opus` (Claude Opus 4.8, needs `claude`), `gpt-5.5` (needs `codex`),
   `gemini` (needs `gemini`). Presets: `opus-duo`, `opus-gpt`, `gpt-duo`,
   `frontier-trio`, `custom`. Judge + synth default to Opus; `--judge`/`--synth`
   override for any preset (e.g. `--judge opus --synth gpt-5.5`). `gpt-duo` runs
   judge + synth on GPT-5.5 — a Codex-only fusion that needs no `claude`.

2. Show the current mode/preset:

   ```bash
   node frontier/cli.cjs status
   ```

3. Run a prompt through the current mode — **this is the action that actually
   fuses**, since nothing auto-runs here. Set a mode first (step 1), then:

   ```bash
   node frontier/cli.cjs run "<prompt>"
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
- Requires `frontier/` present in this repo (copied during Maestro install). If it
  is missing, install Maestro first.
