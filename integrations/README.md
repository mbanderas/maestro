# Maestro integrations — slash commands for other CLIs

The Claude Code plugin ships Maestro's slash commands (`/maestro:*`) plus
enforcement hooks and auto-run. Codex CLI/Desktop can install Maestro as a
native plugin from the repo marketplace; after the Maestro Codex plugin is
installed, enabled, and trusted, Frontier can auto-route normal Codex prompts
when you arm a project/workspace scope. Other agent CLIs mostly support
**custom slash commands** as prompt templates: they inject
instruction text, but do not run wrapper logic, gate tools, or auto-run every
prompt. Those ports are shortcuts around the portable `maestro frontier ...`
CLI, not plugin equivalents.

Portable integrations include `/frontier` and `/update`; Codex also installs
the direct `/maestro` skill hub plus `maestro-frontier`, `maestro-settings`,
`maestro-terse`, and `maestro-update` skills. `/frontier` drives the portable
engine (`maestro frontier ...`);
`/update` refreshes the install. `context-bar` is Claude Code-specific, while
settings and terse are available through Codex skills or the portable CLI. The
orchestration doctrine itself needs no command — it lives in `AGENTS.md` and
loads on demand.

## Placement

| Runtime | Source in this repo | Install to | Invoke |
|---|---|---|---|
| Cursor | `integrations/cursor/commands/frontier.md` | `.cursor/commands/frontier.md` (per-repo) or `~/.cursor/commands/` (global) | `/frontier` |
| Codex (CLI + Desktop) | `codex-skills/maestro/SKILL.md` plus specialized skills in the plugin; `integrations/codex/skills/` mirrors the same files for portable installs | bundled by the `maestro@maestro` Codex plugin; portable fallback copies to `.agents/skills/<name>/SKILL.md` | `/maestro frontier off`, `/maestro settings status`, `/maestro terse ultra` |

After adding a file, restart the tool or open a new chat so it loads.

Use an explicit `--scope` flag when the runtime cannot autodetect one. Codex
plugin contexts resolve a project/workspace scope automatically (`codex-<8hex>`),
which is the recommended default for repo installs. For manual Codex commands,
use `--scope codex-project` from the repo root to target that same active scope:

```bash
maestro frontier catalog
maestro frontier status --scope codex-project
maestro frontier compose --models <model-a>,<model-b> --scope codex-project
maestro frontier compose --models <model-a>,<model-b> --judge <model> --synth <model> --save my-panel --scope codex-project
maestro frontier compose --models <model-a>,<model-b> --dry-run --scope codex-project
maestro frontier mode off --scope codex-project
```

`frontier catalog` is the source of truth for local model readiness, aliases,
and named presets, including legacy presets. Do not copy a static inventory into
an integration: the catalog reports whether a model is selectable and what it
needs, without exposing configured model IDs or secrets. The portable composer
grammar is `maestro frontier compose --models a,b,c [--judge m] [--synth m]
[--save name] [--dry-run] [--scope <name>]`; `--dry-run` changes nothing, and
`--save` saves the composition before arming it.

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
| Codex (CLI + Desktop) | `integrations/codex/skills/maestro-update/SKILL.md` and the `/maestro` hub | `.agents/skills/<name>/SKILL.md` (project/workspace) or `~/.agents/skills/<name>/SKILL.md` (global/user) | `/maestro update` or `/maestro-update` |

**Version model:** Maestro pins no version for portable files. Fetching from
latest `main` always resolves the newest committed code — no manual version bump
needed per release. Before a release, run `node frontier/smoke.cjs` from the
installed engine root to verify the catalog and read-only dispatch contract.

## Caveats

- **Auto-run parity varies.** Claude Code and Codex can auto-route after a mode is
  armed. Cursor, Gemini, Cline, and Windsurf/Devin command ports are manual
  shortcuts unless those runtimes add an equivalent trusted hook surface. Use
  `maestro frontier run "<prompt>" ...` there for one-off panels.
- **Codex uses plugin-bundled skills for direct slash commands, not prompts.**
  Install the marketplace once with `codex plugin marketplace add
  mbanderas/maestro`, then install `maestro@maestro` with `codex plugin add
  maestro@maestro`. The plugin bundles the direct `/maestro` hub plus
  `/maestro-frontier`, `/maestro-settings`, `/maestro-terse`, and
  `/maestro-update` skill entries. Use `/maestro frontier off`,
  `/maestro frontier fusion budget-trio`, `/maestro settings status`, or
  `/maestro terse ultra` — no `/prompts:*` prefix. Restart Codex or open a new
  thread after install/update so the slash list reloads. The portable fallback
  `maestro install --target codex` still copies those skills to
  `.agents/skills/<name>/SKILL.md` (project/workspace) or
  `~/.agents/skills/<name>/SKILL.md` (global/user). Deprecated
  `~/.codex/prompts/*.md` prompt files remain compatibility bridges only.
- **Codex per-repo skill path:** `.agents/skills/<name>/SKILL.md` is the
  repo-scoped option for Codex skills. The global path is
  `~/.agents/skills/<name>/SKILL.md`.
- **Codex Desktop environment:** Desktop/IDE sessions may not inherit shell
  env vars. Put Frontier provider keys and binary overrides in `~/.codex/.env`
  (`ZAI_API_KEY`, `MOONSHOT_API_KEY`, `DEEPSEEK_API_KEY`,
  `MAESTRO_CLAUDE_BIN`) and restart/open a new thread. The optional aliases
  `terra`, `luna`, and `sol` become selectable only when their matching named
  variables — `MAESTRO_FRONTIER_MODEL_TERRA`,
  `MAESTRO_FRONTIER_MODEL_LUNA`, or `MAESTRO_FRONTIER_MODEL_SOL` — are set in
  the environment or `~/.codex/.env`; they have no assumed canonical ID. Run
  `maestro frontier catalog` to see readiness without printing secret values.
- **Maestro Frontier ON indicator (Codex only).** When
  `maestro frontier status --scope codex-project` reports mode != off, the
  `maestro-frontier` skill instructs Codex to lead its reply with
  `Maestro Frontier ON (<label>)` —
  `single - <model>`, `fusion - <preset>`, or
  `fusion - custom (<model1>, <model2>, ...)`. When mode is off, no indicator
  line appears. This is Codex-scoped only and has no effect on Claude Code.
- **Engine location.** Plugin installs run the bundled engine from the
  installed plugin; portable/manual installs run `maestro frontier ...` (or
  `node bin/maestro.cjs frontier ...`) from the repo root, so the engine must
  have been copied in during install. All panel, judge, and synthesizer
  subprocesses run in their provider CLI's read-only/planning mode.
- **Windows + Gemini judge/synth.** `gemini` is fine as a panel member, but a poor
  `--judge`/`--synth` on Windows (its arg-passing rejects the newline-bearing
  judge/synth prompts, so the stage degrades). Use `opus` or `gpt-5.5` for
  judge/synth on Windows.
