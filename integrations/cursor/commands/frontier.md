Maestro Frontier — drive the local multi-CLI fusion engine (switch mode, or run a prompt through the panel).

Drive the **Maestro Frontier** engine — a zero-dependency local multi-CLI fusion
engine (a parallel panel of local CLIs → a judge model's analysis → a grounded
synthesis). It is the same engine the Claude Code plugin ships; here it runs through
the `maestro` CLI, installed into this repo during setup.

**This is a typing shortcut, not the Claude Code plugin.** Cursor has no
prompt hook, so arming a mode does **not** auto-run the engine on later prompts —
it only persists the mode. To actually fuse a prompt, invoke `run` explicitly
(step 3).

Requested action: `$ARGUMENTS`

Map it to one engine CLI call and run it from the repo root. Do not edit
the engine's state file by hand.

1. Switch mode (persists to `~/.config/maestro/frontier-state.cursor.json`; default `off`).
   `--scope cursor` keeps Cursor's armed mode independent from Claude Code and Codex on the same machine:

   ```bash
   maestro frontier mode off --scope cursor
   maestro frontier mode single --model <model> --scope cursor
   maestro frontier mode fusion --preset <preset> --scope cursor
   maestro frontier mode fusion --preset custom --models <a,b,c> --scope cursor
   maestro frontier mode fusion --preset <preset> --judge <model> --synth <model> --scope cursor
   ```

   Models: `opus` (Claude Opus 4.8), `fable` (Claude Fable 5), `sonnet-5`
   (Claude Sonnet 5) — all need `claude`; `gpt-5.5` (needs `codex`), `gemini`
   (needs `gemini`). Presets: `opus-duo`, `opus-gpt`, `gpt-duo`, `frontier-trio`,
   `fable-duo`, `fable-gpt`, `fable-trio`, `sonnet-duo`, `sonnet-gpt`,
   `sonnet-trio`, `frontier-quad`, `frontier-quint`, `custom`. Judge + synth
   default to Opus; `--judge`/`--synth` override for any preset (e.g. `--judge
   opus --synth gpt-5.5`). The family presets self-judge/synth (`gpt-duo` on
   GPT-5.5, `fable-*` on Fable, `sonnet-*` on Sonnet 5); `frontier-quad`/`-quint`
   keep the global Opus judge/synth. Fable 5 is subscription-covered only through
   2026-07-07, then draws Usage Credits — a non-blocking `[frontier] …` stderr
   advisory fires past the cutoff; relay it to the user.

2. Show the current mode/preset:

   ```bash
   maestro frontier status --scope cursor
   ```

3. Run a prompt through the current mode — **this is the action that actually
   fuses**, since nothing auto-runs here. Set a mode first (step 1), then:

   ```bash
   maestro frontier run "<prompt>" --scope cursor
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
