---
description: Maestro Frontier local multi-CLI engine: switch mode (off/single/fusion), pick a model/preset, or run a prompt
argument-hint: "<off | single <model> | fusion <preset> | status | run <prompt>>"
allowed-tools: Bash, Read
---

Drive the Maestro Frontier engine: a zero-dependency local multi-CLI
fusion engine (parallel panel of local CLIs -> Opus judge analysis ->
grounded synthesis). Default mode is `off`: the engine is opt-in and
never runs until you switch it on. Arming it (`single` or `fusion`)
makes it **auto-run on every prompt** — a `UserPromptSubmit` hook
(`hooks/frontier-autorun.cjs`) routes each prompt through the engine and
the live session relays the synthesized answer. `off` disables auto-run.
Autorun blocks the turn until the engine returns; the hook carries a
300s timeout (`hooks/hooks.json`), and a run that exceeds it is skipped
so the turn proceeds normally. Any engine error degrades the same way.

Requested action: `$ARGUMENTS`

Map the argument to one engine CLI call and run it. The engine is
self-contained; do not edit its state file yourself.

1. Mode switch (persists across sessions; default `off`):

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/frontier/cli.cjs" mode off
   node "${CLAUDE_PLUGIN_ROOT}/frontier/cli.cjs" mode single --model <model>
   node "${CLAUDE_PLUGIN_ROOT}/frontier/cli.cjs" mode fusion --preset <preset>
   node "${CLAUDE_PLUGIN_ROOT}/frontier/cli.cjs" mode fusion --preset custom --models <a,b,c>
   node "${CLAUDE_PLUGIN_ROOT}/frontier/cli.cjs" mode fusion --preset <preset> --judge <model> --synth <model>
   ```

   Models: `opus` (Claude Opus 4.8), `gpt-5.5` (Codex), `gemini`
   (Gemini 3.1 Pro). Presets: `opus-duo`, `opus-gpt`, `gpt-duo`,
   `frontier-trio`, `custom`. The judge + synthesizer default to Opus,
   but `gpt-duo` runs them on GPT-5.5 (a Codex-only fusion that needs no
   `claude`), and `--judge`/`--synth` override the model for any preset,
   so you can mix freely (e.g. `--judge opus --synth gpt-5.5`).

2. Show current mode/preset:

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/frontier/cli.cjs" status
   ```

3. Run a prompt through the current mode (prompt as the argument, or
   piped on stdin). This is a manual one-off; when the engine is armed
   (`single`/`fusion`) the autorun hook already runs every prompt for
   you, so `run` is mainly for scripting or an explicit re-run:

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/frontier/cli.cjs" run "<prompt>"
   ```

   - `off`: prints a notice and exits without spawning anything;
     normal Maestro behavior is unchanged.
   - `single`: dispatches the one selected CLI and prints its answer.
   - `fusion`: runs the panel in parallel, then the Opus judge and
     synthesizer; prints the final answer (a one-line run meta of
     preset, models, analysis present, and failed models goes to stderr).

4. Report the engine's stdout verbatim. On an error the engine prints
   `ERROR [<failure_reason>]: <detail>` to stderr and exits non-zero;
   relay the failure_reason.

Notes:

- Real `single`/`fusion` runs spawn local CLIs and cost tokens; each
  cold `claude -p` panel/judge/synth call is non-trivial. Use small
  prompts. `off` is free.
- Headless web access varies per CLI (Codex confirmed; Claude and
  Gemini gated off in this build). The engine sets a per-adapter
  `webTools` flag accordingly; see the risk burndown.
- `gemini` works well as a panel member, but on Windows it is a poor
  `--judge`/`--synth` choice: it takes its prompt as an argument and the
  judge/synth prompts contain newlines, which the win32 arg-safety guard
  refuses, so the stage then degrades (judge omitted, synth falls back).
  Use `opus` or `gpt-5.5` for judge/synth on Windows. (No such limit on
  macOS/Linux, where args are passed directly.)

## Binary overrides

The engine is zero-dependency CommonJS under `frontier/`. Each CLI is
resolved from your `PATH`: `claude` (Opus 4.8), `codex` (GPT-5.5), and
`gemini` (Gemini 3.1 Pro). When a binary is not on `PATH`, or you want a
specific build, point at it with an environment variable:

- `MAESTRO_CLAUDE_BIN` sets the `claude` binary path.
- `MAESTRO_CODEX_BIN` sets the `codex` binary path.
- `MAESTRO_GEMINI_BIN` sets the `gemini` binary path.
