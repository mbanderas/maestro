# Maestro integrations — slash commands for other CLIs

The Claude Code plugin ships Maestro's slash commands (`/maestro:*`) plus
enforcement hooks and auto-run. Codex CLI/Desktop can use Codex-native skills,
trusted project config, and plugin-bundled hooks; after the Maestro Codex plugin
is installed, enabled, and trusted, Frontier can auto-route normal Codex prompts
when you arm a project/workspace scope. Other agent CLIs mostly support
**custom slash commands** as prompt templates: they inject
instruction text, but do not run wrapper logic, gate tools, or auto-run every
prompt. Those ports are shortcuts around the portable `maestro frontier ...`
CLI, not plugin equivalents.

Portable integrations include `/frontier` and `/update`; Codex also installs
`maestro-frontier`, `maestro-settings`, `maestro-terse`, and `maestro-update`
skills. `/frontier` drives the portable engine (`maestro frontier ...`);
`/update` refreshes the install. `context-bar` is Claude Code-specific, while
settings and terse are available through Codex skills or the portable CLI. The
orchestration doctrine itself needs no command — it lives in `AGENTS.md` and
loads on demand.

## Placement

| Runtime | Source in this repo | Install to | Invoke |
|---|---|---|---|
| Cursor | `integrations/cursor/commands/frontier.md` | `.cursor/commands/frontier.md` (per-repo) or `~/.cursor/commands/` (global) | `/frontier` |
| Codex (CLI + Desktop) | `integrations/codex/skills/maestro-frontier/SKILL.md` (plus `maestro-terse`, `maestro-settings`, `maestro-update`) | `.agents/skills/<name>/SKILL.md` (project/workspace) or `~/.agents/skills/<name>/SKILL.md` (global/user) | ask for the Maestro skill |

After adding a file, restart the tool or open a new chat so it loads.

Use an explicit `--scope` flag when the runtime cannot autodetect one. Codex
plugin contexts resolve a project/workspace scope automatically (`codex-<8hex>`),
which is the recommended default for repo installs. For manual Codex commands,
use `--scope codex-project` from the repo root to target that same active scope:

```bash
maestro frontier status --scope codex-project
maestro frontier mode fusion --preset chatgpt-duo --scope codex-project
maestro frontier mode fusion --preset frontier-trio --judge chatgpt --synth chatgpt --scope codex-project
maestro frontier mode off --scope codex-project
```

Global/user scope is optional and should be intentional. Cursor uses
`--scope cursor`, Cline uses `--scope cline`, Gemini uses `--scope gemini`, and
Windsurf/Devin use `--scope windsurf`.

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
| Codex (CLI + Desktop) | `integrations/codex/skills/maestro-update/SKILL.md` | `.agents/skills/maestro-update/SKILL.md` (project/workspace) or `~/.agents/skills/maestro-update/SKILL.md` (global/user) | ask for `maestro-update` |

**Version model:** Maestro pins no version for portable files. Fetching from
latest `main` always resolves the newest committed code — no manual version bump
needed per release.

## Caveats

- **Auto-run parity varies.** Claude Code and Codex can auto-route after a mode is
  armed. Cursor, Gemini, Cline, and Windsurf/Devin command ports are manual
  shortcuts unless those runtimes add an equivalent trusted hook surface. Use
  `maestro frontier run "<prompt>" ...` there for one-off panels.
- **Codex uses skills, not prompts.** `maestro install --target codex` installs the
  `maestro-frontier`, `maestro-terse`, `maestro-settings`, and `maestro-update`
  skills to `.agents/skills/<name>/SKILL.md` (project/workspace) or
  `~/.agents/skills/<name>/SKILL.md` (global/user). Safe migration/update refreshes
  Maestro-managed files, preserves user-edited files, and migrates older unprefixed
  skill names where safe. Deprecated `~/.codex/prompts/*.md` prompt files remain
  compatibility bridges only.
- **Codex per-repo skill path:** `.agents/skills/<name>/SKILL.md` is the
  repo-scoped option for Codex skills. The global path is
  `~/.agents/skills/<name>/SKILL.md`.
- **Maestro Frontier ON indicator (Codex only).** When
  `maestro frontier status --scope codex-project` reports mode != off, the `maestro-frontier` skill
  instructs Codex to lead its reply with `Maestro Frontier ON (<label>)` —
  `single · <model>` or `fusion · <preset>`. When mode is off, no indicator line
  appears. This is Codex-scoped only and has no effect on Claude Code.
- **Requires `frontier/` and `bin/maestro.cjs` in the project.** The command runs
  `maestro frontier ...` (or `node bin/maestro.cjs frontier ...`) from the repo root,
  so the engine must have been copied in during install.
- **Windows + Gemini judge/synth.** `gemini` is fine as a panel member, but a poor
  `--judge`/`--synth` on Windows (its arg-passing rejects the newline-bearing
  judge/synth prompts, so the stage degrades). Use `opus` or `gpt-5.5` for
  judge/synth on Windows.
