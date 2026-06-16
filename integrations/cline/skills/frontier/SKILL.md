---
name: frontier
description: Maestro Frontier local multi-CLI fusion engine — switch mode, or run a prompt through the panel
---

Drive the **Maestro Frontier** engine — a zero-dependency local multi-CLI fusion
engine (a parallel panel of local CLIs → a judge model's analysis → a grounded
synthesis). It is the same engine the Claude Code plugin ships; here it runs
through the `maestro` CLI with `--scope cline`.

**Install path (pick one):**

- Project-scoped: `.cline/skills/frontier/SKILL.md`
- Global: `~/.cline/skills/frontier/SKILL.md`

**This is a typing shortcut, not the Claude Code plugin.** Cline has no prompt
hook, so arming a mode does **not** auto-run the engine on later prompts — it
only persists the mode. To actually fuse a prompt, invoke `run` explicitly
(step 3).

When the user invokes this skill, map their request to one engine CLI call and
run it in the terminal (Cline will request approval before executing). Do not
edit the engine's state file by hand.

## 1. Switch mode

Persists to `~/.config/maestro/frontier-state.cline.json`; default `off`.
`--scope cline` keeps Cline's armed mode independent from Claude Code, Codex,
Cursor, and Gemini on the same machine:

```bash
maestro frontier mode off --scope cline
maestro frontier mode single --model <model> --scope cline
maestro frontier mode fusion --preset <preset> --scope cline
maestro frontier mode fusion --preset custom --models <a,b,c> --scope cline
maestro frontier mode fusion --preset <preset> --judge <model> --synth <model> --scope cline
```

Models: `opus` (Claude Opus 4.8, needs `claude`), `gpt-5.5` (needs `codex`),
`gemini` (needs `gemini`). Presets: `opus-duo`, `opus-gpt`, `gpt-duo`,
`frontier-trio`, `custom`. Judge + synth default to Opus; `--judge`/`--synth`
override for any preset (e.g. `--judge opus --synth gpt-5.5`). `gpt-duo` runs
judge + synth on GPT-5.5 — a Codex-only fusion that needs no `claude`.

## 2. Show current mode/preset

```bash
maestro frontier status --scope cline
```

## 3. Run a prompt through the current mode

This is the action that actually fuses, since nothing auto-runs here. Set a
mode first (step 1), then:

```bash
maestro frontier run "<prompt>" --scope cline
```

- `off`: prints a notice, spawns nothing.
- `single`: dispatches the one selected CLI, prints its answer.
- `fusion`: runs the panel in parallel → judge → synthesizer; prints the final
  answer (a one-line run meta goes to stderr). Report stdout verbatim.

On error the engine prints `ERROR [<reason>]: <detail>` to stderr and exits
non-zero — relay the reason.

## Notes

- Real `single`/`fusion` runs spawn local CLIs and cost tokens; use small prompts.
  `off` is free.
- Each model's CLI must be on `PATH`, or point at a specific build with
  `MAESTRO_CLAUDE_BIN` / `MAESTRO_CODEX_BIN` / `MAESTRO_GEMINI_BIN`.
- Requires `maestro` on `PATH` (installed during Maestro setup). If it is missing,
  install Maestro first.
