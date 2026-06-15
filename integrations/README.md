# Maestro integrations — slash commands for other CLIs

The Claude Code plugin ships Maestro's slash commands (`/maestro:*`) plus
enforcement hooks and auto-run. Other agent CLIs support **custom slash commands**
too, but only as *prompt templates* — they inject instruction text, they do not run
wrapper logic, gate tools, or auto-run on every prompt. So these ports are typing
shortcuts that tell the agent to shell out to the portable Frontier engine
(`frontier/cli.cjs`); they are **not** a plugin equivalent.

Only `/frontier` is ported, because it is the one command that drives portable
machinery (the zero-dependency Node engine). `terse`, `context-bar`, and `settings`
depend on Claude Code hooks/status line and would only inject text elsewhere;
`compress` operates on memory files and is partly portable. The orchestration
doctrine itself needs no command — it lives in `AGENTS.md` and loads on demand.

## Placement

| Runtime | Source in this repo | Install to | Invoke |
|---|---|---|---|
| Cursor | `integrations/cursor/commands/frontier.md` | `.cursor/commands/frontier.md` (per-repo) or `~/.cursor/commands/` (global) | `/frontier` |
| Codex (CLI + IDE/Desktop) | `integrations/codex/prompts/frontier.md` | `~/.codex/prompts/frontier.md` (global only) | `/frontier` |

After adding a file, restart the tool or open a new chat so it loads. Both runtimes
expand `$ARGUMENTS` to the full argument string — `/frontier fusion opus-gpt` passes
`fusion opus-gpt`.

## Caveats

- **No auto-run.** Neither runtime has a `UserPromptSubmit` hook, so arming a mode
  (`mode fusion`) only persists state — nothing fuses later prompts automatically.
  Use `/frontier run "<prompt>"` to actually run the panel.
- **Codex custom prompts are deprecated.** OpenAI's docs say *"Deprecated. Use
  skills for reusable prompts."* The prompt file still works in current Codex (CLI
  and IDE), but the forward path is a Codex *skill* (repo-shareable, implicitly
  invoked) — a different format than this template. This port favors the simple
  prompt file by design.
- **Codex has no confirmed per-repo prompt path** — `~/.codex/prompts/` is global
  per-user. Cursor's `.cursor/commands/` is the repo-scoped option.
- **Requires `frontier/` in the project.** The command runs `node frontier/cli.cjs`
  from the repo root, so the engine must have been copied in during install.
- **Windows + Gemini judge/synth.** `gemini` is fine as a panel member, but a poor
  `--judge`/`--synth` on Windows (its arg-passing rejects the newline-bearing
  judge/synth prompts, so the stage degrades). Use `opus` or `gpt-5.5` for
  judge/synth on Windows.
