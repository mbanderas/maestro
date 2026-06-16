Maestro Frontier — drive the local multi-CLI fusion engine (switch mode, or run a prompt through the panel).

Drive the **Maestro Frontier** engine — a zero-dependency local multi-CLI fusion
engine (a parallel panel of local CLIs → a judge model's analysis → a grounded
synthesis). It is the same engine the Claude Code plugin ships; here it runs
through the `maestro` CLI with `--scope windsurf`.

**Install path (pick one):**

- Project-scoped: `.windsurf/workflows/frontier.md`
- Global: `~/.codeium/windsurf/global_workflows/frontier.md`

Once installed, invoke with `/frontier <args>` inside Windsurf Cascade.

**This is a typing shortcut, not the Claude Code plugin.** Windsurf Cascade has
no prompt hook, so arming a mode does **not** auto-run the engine on later
prompts — it only persists the mode. To actually fuse a prompt, invoke `run`
explicitly (step 3).

When this workflow is invoked, map the requested action to one engine CLI call
and run it in the terminal. Cascade will request approval before executing. Do
not edit the engine's state file by hand.

1. Switch mode (persists to `~/.config/maestro/frontier-state.windsurf.json`; default `off`).
   `--scope windsurf` keeps Windsurf's armed mode independent from Claude Code,
   Codex, Cursor, Gemini, and Cline on the same machine:

   ```bash
   maestro frontier mode off --scope windsurf
   maestro frontier mode single --model <model> --scope windsurf
   maestro frontier mode fusion --preset <preset> --scope windsurf
   maestro frontier mode fusion --preset custom --models <a,b,c> --scope windsurf
   maestro frontier mode fusion --preset <preset> --judge <model> --synth <model> --scope windsurf
   ```

   Models: `opus` (Claude Opus 4.8, needs `claude`), `gpt-5.5` (needs `codex`),
   `gemini` (needs `gemini`). Presets: `opus-duo`, `opus-gpt`, `gpt-duo`,
   `frontier-trio`, `custom`. Judge + synth default to Opus; `--judge`/`--synth`
   override for any preset (e.g. `--judge opus --synth gpt-5.5`). `gpt-duo` runs
   judge + synth on GPT-5.5 — a Codex-only fusion that needs no `claude`.

2. Show the current mode/preset:

   ```bash
   maestro frontier status --scope windsurf
   ```

3. Run a prompt through the current mode — **this is the action that actually
   fuses**, since nothing auto-runs here. Set a mode first (step 1), then:

   ```bash
   maestro frontier run "<prompt>" --scope windsurf
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
