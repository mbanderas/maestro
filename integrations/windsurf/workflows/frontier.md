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
explicitly (step 4).

When this workflow is invoked, map the requested action to one engine CLI call
and run it in the terminal. Cascade will request approval before executing. Do
not edit the engine's state file by hand.

1. Inspect or compose before choosing a model/preset. `frontier catalog` is the
   source of truth for locally selectable models, named presets (including
   legacy presets), aliases, and readiness. It does not print secrets or
   configured model IDs. `compose` validates ready models and arms the resolved
   custom panel unless `--dry-run` is supplied:

   ```bash
   maestro frontier catalog
   maestro frontier compose --models <model-a>,<model-b> --scope windsurf
   maestro frontier compose --models <model-a>,<model-b> --judge <model> --synth <model> --save my-panel --scope windsurf
   maestro frontier compose --models <model-a>,<model-b> --dry-run --scope windsurf
   ```

2. Switch mode (persists under Maestro's platform-specific config directory:
   `$XDG_CONFIG_HOME/maestro` when set; otherwise `%APPDATA%\maestro` on
   Windows or `~/.config/maestro`; default `off`).
   `--scope windsurf` keeps Windsurf's armed mode independent from Claude Code,
   Codex, Cursor, Gemini, and Cline on the same machine:

   ```bash
   maestro frontier mode off --scope windsurf
   maestro frontier mode single --model <model> --scope windsurf
   maestro frontier mode fusion --preset <preset> --scope windsurf
   maestro frontier mode fusion --preset custom --models <a,b,c> --scope windsurf
   maestro frontier mode fusion --preset <preset> --judge <model> --synth <model> --scope windsurf
   ```

   Existing named presets remain supported; use `frontier catalog` instead of a
   static list. `--judge` / `--synth` can override either stage for a named
   preset. For a ready explicit panel, prefer `frontier compose` above.

3. Show the current mode/preset:

   ```bash
   maestro frontier status --scope windsurf
   ```

4. Run a prompt through the current mode — **this is the action that actually
   fuses**, since nothing auto-runs here. Set a mode first (step 2), then:

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
  `off` is free. Every panel, judge, and synthesizer subprocess runs in the
  provider CLI's read-only/planning mode.
- Each model's CLI must be on `PATH`, or point at a specific build with
  `MAESTRO_CLAUDE_BIN` / `MAESTRO_CODEX_BIN` / `MAESTRO_GEMINI_BIN`.
- `terra`, `luna`, and `sol` have no assumed canonical model ID. They become
  selectable only when their matching `MAESTRO_FRONTIER_MODEL_TERRA`,
  `MAESTRO_FRONTIER_MODEL_LUNA`, or `MAESTRO_FRONTIER_MODEL_SOL` variable is
  configured in the environment or `~/.codex/.env`; confirm with `frontier catalog`.
- Run `node frontier/smoke.cjs` from the installed engine root for release
  verification.
- Requires `maestro` on `PATH` (installed during Maestro setup). If it is missing,
  install Maestro first.
