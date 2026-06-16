# Maestro integrations — slash commands for other CLIs

The Claude Code plugin ships Maestro's slash commands (`/maestro:*`) plus
enforcement hooks and auto-run. Other agent CLIs support **custom slash commands**
too, but only as *prompt templates* — they inject instruction text, they do not run
wrapper logic, gate tools, or auto-run on every prompt. So these ports are typing
shortcuts that tell the agent to shell out to the portable Frontier engine via
`maestro frontier ...`; they are **not** a plugin equivalent.

Only `/frontier` and `/update` are ported. `/frontier` drives the portable engine
(`maestro frontier ...`); `/update` refreshes the install (git pull or re-download +
re-copy `frontier/`, `bin/maestro.cjs`, and the command files). `terse`,
`context-bar`, and `settings` depend on Claude Code hooks/status line and would only
inject text elsewhere; `compress` operates on memory files and is partly portable.
The orchestration doctrine itself needs no command — it lives in `AGENTS.md` and
loads on demand.

## Placement

| Runtime | Source in this repo | Install to | Invoke |
|---|---|---|---|
| Cursor | `integrations/cursor/commands/frontier.md` | `.cursor/commands/frontier.md` (per-repo) or `~/.cursor/commands/` (global) | `/frontier` |
| Codex (CLI + IDE/Desktop) | `integrations/codex/prompts/frontier.md` | `~/.codex/prompts/frontier.md` (global only) | `/frontier` |

After adding a file, restart the tool or open a new chat so it loads. Both runtimes
expand `$ARGUMENTS` to the full argument string — `/frontier fusion opus-gpt` passes
`fusion opus-gpt`.

Each runtime passes an explicit `--scope` flag so armed state is per-CLI and never
leaks across runtimes on the same machine: Codex uses `--scope codex`, Cursor uses
`--scope cursor`. Claude Code autodetects its scope and needs no flag. If you add a
Gemini or Antigravity integration, pass `--scope gemini`.

## Updating portable installs

Portable installs have no plugin system. Update = refresh the copied files from
latest `main`.

**If you cloned the Maestro repo:**

```bash
git -C <path-to-maestro-clone> pull
```

Then re-copy `frontier/` and the integration command files into your project.

**If you copied files manually** (no clone), re-download from latest `main` and
overwrite the copies in your project:

```bash
curl -O https://raw.githubusercontent.com/mbanderas/maestro/main/AGENTS.md
curl -O https://raw.githubusercontent.com/mbanderas/maestro/main/frontier/cli.cjs
curl -O https://raw.githubusercontent.com/mbanderas/maestro/main/bin/maestro.cjs
# Also re-copy the integration command file(s) you installed.
```

A `/update` shortcut command ships for each runtime — install it once and future
updates are a single invocation:

| Runtime | Source in this repo | Install to | Invoke |
|---|---|---|---|
| Cursor | `integrations/cursor/commands/update.md` | `.cursor/commands/update.md` (per-repo) or `~/.cursor/commands/` (global) | `/update` |
| Codex (CLI + IDE/Desktop) | `integrations/codex/prompts/update.md` | `~/.codex/prompts/update.md` (global only) | `/update` |

**Version model:** Maestro pins no version for portable files. Fetching from
latest `main` always resolves the newest committed code — no manual version bump
needed per release.

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
- **Requires `frontier/` and `bin/maestro.cjs` in the project.** The command runs
  `maestro frontier ...` (or `node bin/maestro.cjs frontier ...`) from the repo root,
  so the engine must have been copied in during install.
- **Windows + Gemini judge/synth.** `gemini` is fine as a panel member, but a poor
  `--judge`/`--synth` on Windows (its arg-passing rejects the newline-bearing
  judge/synth prompts, so the stage degrades). Use `opus` or `gpt-5.5` for
  judge/synth on Windows.
