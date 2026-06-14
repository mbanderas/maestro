---
description: Maestro Frontier local multi-CLI engine — switch mode (off/single/fusion), pick a model/preset, or run a prompt
argument-hint: "<off | single <model> | fusion <preset> | status | run <prompt>>"
allowed-tools: Bash, Read
---

Drive the Maestro Frontier engine: a zero-dependency local reproduction
of OpenRouter Fusion (parallel panel of local CLIs -> Opus judge
analysis -> grounded Opus synthesis). Default mode is `off` — the engine
is opt-in and never runs until you switch it on.

Requested action: `$ARGUMENTS`

Map the argument to one engine CLI call and run it. The engine is
self-contained; do not edit its state file yourself.

1. Mode switch (persists across sessions; default `off`):

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/frontier/cli.cjs" mode off
   node "${CLAUDE_PLUGIN_ROOT}/frontier/cli.cjs" mode single --model <model>
   node "${CLAUDE_PLUGIN_ROOT}/frontier/cli.cjs" mode fusion --preset <preset>
   node "${CLAUDE_PLUGIN_ROOT}/frontier/cli.cjs" mode fusion --preset custom --models <a,b,c>
   ```

   Models: `opus` (Claude Opus 4.8), `gpt-5.5` (Codex), `gemini`
   (Gemini 3.1 Pro). Presets: `opus-duo`, `opus-gpt`, `frontier-trio`,
   `custom`. Judge + synthesizer are always Opus.

2. Show current mode/preset:

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/frontier/cli.cjs" status
   ```

3. Run a prompt through the current mode (prompt as the argument, or
   piped on stdin):

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/frontier/cli.cjs" run "<prompt>"
   ```

   - `off`: prints a notice and exits without spawning anything —
     normal Maestro behavior is unchanged.
   - `single`: dispatches the one selected CLI and prints its answer.
   - `fusion`: runs the panel in parallel, then the Opus judge and
     synthesizer; prints the final answer (a one-line run meta —
     preset, models, analysis present, failed models — goes to stderr).

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
