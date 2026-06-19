---
description: Maestro Frontier local multi-CLI engine: arm a mode (off/single/fusion) so it auto-runs every prompt, pick a model/preset, or run a one-off prompt
argument-hint: "<off | single <model> | fusion <preset> | status | run <prompt> | adopt>"
allowed-tools: Bash, Read
---

Drive the Maestro Frontier engine: a zero-dependency local multi-CLI
fusion engine (parallel panel of local CLIs -> a judge model's
analysis -> grounded synthesis). Default mode is `off`: the engine is opt-in and
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
   node "${CLAUDE_PLUGIN_ROOT}/bin/maestro.cjs" frontier mode off
   node "${CLAUDE_PLUGIN_ROOT}/bin/maestro.cjs" frontier mode single --model <model>
   node "${CLAUDE_PLUGIN_ROOT}/bin/maestro.cjs" frontier mode fusion --preset <preset>
   node "${CLAUDE_PLUGIN_ROOT}/bin/maestro.cjs" frontier mode fusion --preset custom --models <a,b,c>
   node "${CLAUDE_PLUGIN_ROOT}/bin/maestro.cjs" frontier mode fusion --preset <preset> --judge <model> --synth <model>
   ```

   Models: `opus` (Claude Opus 4.8), `gpt-5.5` (Codex), `gemini`
   (Gemini 3.1 Pro). Presets: `opus-duo`, `opus-gpt`, `gpt-duo`,
   `frontier-trio`, `custom`. The judge + synthesizer default to Opus,
   but `gpt-duo` runs them on GPT-5.5 (a Codex-only fusion that needs no
   `claude`), and `--judge`/`--synth` override the model for any preset,
   so you can mix freely (e.g. `--judge opus --synth gpt-5.5`).

2. Show current mode/preset:

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/bin/maestro.cjs" frontier status
   ```

3. Run a prompt through the current mode (prompt as the argument, or
   piped on stdin). This is a manual one-off; when the engine is armed
   (`single`/`fusion`) the autorun hook already runs every prompt for
   you, so `run` is mainly for scripting or an explicit re-run:

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/bin/maestro.cjs" frontier run "<prompt>"
   ```

   - `off`: prints a notice and exits without spawning anything;
     normal Maestro behavior is unchanged.
   - `single`: dispatches the one selected CLI and prints its answer.
   - `fusion`: runs the panel in parallel, then the judge and
     synthesizer models; prints the final answer (a one-line run meta of
     preset, models, analysis present, and failed models goes to stderr).

4. Adopt a previously-armed **global** mode into this workspace
   (per-workspace isolation means a workspace never inherits the old
   global state automatically — this copies it in once, on demand):

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/bin/maestro.cjs" frontier adopt
   node "${CLAUDE_PLUGIN_ROOT}/bin/maestro.cjs" frontier adopt --force
   ```

   Reads the legacy global `frontier-state.json` read-only and writes it
   into this workspace's `frontier-state.cc-<hash>.json`. It refuses to
   overwrite an existing workspace state unless `--force`, never touches
   the legacy file, and only targets a Claude Code `cc-*` scope. If
   there is no legacy state (`missing-legacy`) it does nothing — arm the
   workspace with `mode` instead.

5. Report the result, matched to the action:
   - `run`: report the engine's stdout verbatim.
   - `adopt`: confirm the adopted mode/preset, or relay the
     `ERROR [<reason>]` (e.g. `exists` — suggest `--force`; `missing-legacy`
     — nothing to adopt). Arming now auto-runs on every prompt.
   - arming a mode (`single`/`fusion`): confirm the mode, then tell the
     user plainly that the engine now **auto-runs on every prompt** —
     they just chat normally and the synthesized answer is relayed.
     Do NOT tell the user to call `run` manually; arming already routes
     every prompt through the engine (`run` is only a scripted one-off).
   - `off`: confirm auto-run is disabled and normal Maestro resumes.
   - `status`: report the current mode/preset.

   On an error the engine prints `ERROR [<failure_reason>]: <detail>`
   to stderr and exits non-zero; relay the failure_reason.

Notes:

- **Arming in Claude Code is per-workspace.** State is stored in a
  workspace-scoped file (`frontier-state.cc-<hash>.json`, keyed to the
  git project root). Arming in one workspace does not affect any other.
  After upgrading Maestro, each Claude Code workspace starts `off` and
  must be re-armed — no automatic migration into workspace scopes.
  `adopt` (step 4) is the explicit opt-in to copy a prior global mode in.
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

## Concurrency — fusion is safe to run in one workspace

Frontier mirrors the OpenRouter Fusion / Mixture-of-Agents shape: one
prompt fans to a panel, a judge maps agreement and contradiction, a
synthesizer writes the grounded answer. The panel/judge/synth members
are **read-only, one-shot `-p` subprocesses** — they emit text to stdout
(or a unique tmp last-message file) and exit; they never commit, never
edit the repo, and never run an autonomous loop. So arming `fusion`
(e.g. `opus-duo`) and letting two or more model CLIs work the same
workspace at once is **safe by construction** — there is no shared branch
or checkpoint for them to race. This is categorically different from two
independent autonomous *build* loops on one branch, which IS the
S10-forbidden "loops never spawn loops" state.

To make that distinction machine-checkable, every Frontier run stamps
itself and all of its children with `MAESTRO_FRONTIER_RUN_ID`
(`frontier-<base36 ts>-<rand>`), generated once per top-level run and
inherited unchanged by nested calls — propagated to each child over the
same `process.env` channel as `FUSION_DEPTH`. A coordinated, read-only
Frontier subprocess therefore carries this variable; a rogue independent
write-loop does not. When re-grounding (S7.0/S10) and you see a sibling
`claude`/`codex`/`gemini` process in the workspace, a set
`MAESTRO_FRONTIER_RUN_ID` means it is a coordinated panel/judge/synth
member to leave alone — not a second loop to stop for.
