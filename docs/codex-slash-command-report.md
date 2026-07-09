# Codex Slash Command Porting Report

## Goal

Give Codex Desktop and Codex CLI a direct Maestro command surface:

```text
/maestro frontier off
/maestro frontier fusion budget-trio
/maestro frontier roster
/maestro settings status
/maestro terse ultra
/maestro update
```

Requirement: no `/prompts:*` prefix. Same mental model as Claude Code
`/maestro:*`, adapted to Codex extension surfaces.

## Key Codex Constraint

Codex custom prompt files under `~/.codex/prompts` can create slash commands,
but they appear as prompt commands such as `/prompts:name`. That did not meet
the UX target.

Codex installed skills are the better surface. Enabled skills appear in the
slash-command list in Codex Desktop, Codex IDE, and Codex CLI. Therefore
Maestro exposes `/maestro` by shipping a Codex skill named `maestro`.

## Implemented Shape

Maestro now bundles five Codex skills:

| Skill | Slash surface | Purpose |
|---|---|---|
| `maestro` | `/maestro ...` | Direct command hub |
| `maestro-frontier` | `/maestro-frontier ...` | Frontier-only entry |
| `maestro-settings` | `/maestro-settings ...` | Settings entry |
| `maestro-terse` | `/maestro-terse ...` | Terse-mode entry |
| `maestro-update` | `/maestro-update` | Plugin update entry |

Primary user path is `/maestro ...`; specialized entries remain useful when
Codex lists every skill separately.

## Files Added

```text
codex-skills/maestro/SKILL.md
integrations/codex/skills/maestro/SKILL.md
```

`codex-skills/maestro/SKILL.md` is plugin-bundled source. The integration copy
mirrors it for portable/manual installs.

## Manifest Wiring

Codex plugin manifest already points at bundled skills:

```json
{
  "skills": "./codex-skills/"
}
```

No special `commands` manifest key was needed. Codex discovers skill dirs under
that path; each skill lives at:

```text
codex-skills/<skill-name>/SKILL.md
```

The slash command name comes from `SKILL.md` front matter:

```markdown
---
name: maestro
description: Direct Maestro command hub for Codex slash menu: frontier, settings, terse, and update
---
```

Result: enabled plugin skill appears as `/maestro`.

## Hub Skill Design

The `maestro` skill is a router. It maps text after `/maestro` to one local
operation and runs repo-local or plugin-local CLIs.

Preferred project-local launchers:

```bash
node bin/maestro.cjs frontier ...
node settings/cli.cjs status
```

Plugin fallback launchers:

```bash
node "<maestro-plugin-root>/bin/maestro.cjs" frontier ...
node "<maestro-plugin-root>/settings/cli.cjs" status
```

The skill finds plugin root by walking upward from `SKILL.md` until
`.codex-plugin/plugin.json` exists.

## Command Mapping

Frontier commands use project scope by default:

```text
/maestro frontier off
/maestro frontier status
/maestro frontier roster
/maestro frontier single <model>
/maestro frontier fusion <preset>
/maestro frontier run "<prompt>"
```

Mapped engine calls:

```bash
node bin/maestro.cjs frontier mode off --scope codex-project
node bin/maestro.cjs frontier status --scope codex-project
node bin/maestro.cjs frontier roster
node bin/maestro.cjs frontier mode single --model <model> --scope codex-project
node bin/maestro.cjs frontier mode fusion --preset <preset> --scope codex-project
node bin/maestro.cjs frontier run "<prompt>" --scope codex-project
```

Settings commands:

```text
/maestro settings status
/maestro settings list
/maestro settings help
/maestro settings set verify block
```

Mapped settings calls:

```bash
node settings/cli.cjs status --scope codex-project
node settings/cli.cjs list
node settings/cli.cjs help
node settings/cli.cjs set verify block --scope codex-project
```

Terse commands:

```text
/maestro terse off
/maestro terse lite
/maestro terse full
/maestro terse ultra
```

Mapped settings call:

```bash
node settings/cli.cjs set terse ultra
```

Update command:

```text
/maestro update
```

Mapped Codex plugin update:

```bash
codex plugin marketplace upgrade maestro
codex plugin add maestro@maestro
```

If marketplace absent:

```bash
codex plugin marketplace add mbanderas/maestro
codex plugin add maestro@maestro
```

## Installer Changes

Portable install now copies direct Codex skills instead of deprecated prompt
wrappers.

Installer skill inventory:

```js
const CODEX_SKILLS = [
  { name: 'maestro', legacy: null },
  { name: 'maestro-frontier', legacy: 'frontier' },
  { name: 'maestro-terse', legacy: 'terse' },
  { name: 'maestro-settings', legacy: 'settings' },
  { name: 'maestro-update', legacy: 'update' },
];
```

For Codex target, wrapper install is a no-op:

```text
[codex] No prompt wrapper - skills deliver /maestro commands.
```

Project install path:

```text
.agents/skills/<name>/SKILL.md
```

User/global install path:

```text
~/.agents/skills/<name>/SKILL.md
```

Existing user-edited skills are preserved. Managed Maestro skills refresh.
Legacy unprefixed skills (`frontier`, `settings`, `terse`, `update`) migrate to
compatibility shims when safe.

## Tests Added Or Updated

Installer tests assert:

- `maestro` hub skill is installed.
- `maestro` hub contains `/maestro frontier off` and `/maestro settings status`.
- Codex install does not create deprecated `.codex/prompts/frontier.md`.
- User/global install creates `~/.agents/skills/maestro/SKILL.md`.

Plugin tests assert:

- Codex manifest still exposes `./codex-skills/`.
- Bundled `maestro` skill exists.
- Plugin skill matches integration mirror.

CLI example scanner changed so fenced slash-command examples like
`/maestro frontier off` are not mistaken for shell invocations of
`maestro frontier`.

## Docs Updated

README and Codex docs now show:

```text
/maestro frontier status
/maestro frontier single opus
/maestro frontier fusion opus-gpt
/maestro frontier run "your prompt here"
/maestro frontier off
```

Integration docs now say:

- Codex uses plugin-bundled skills for direct slash commands.
- Do not use `/prompts:*`.
- Restart Codex or open a new thread after install/update so slash list reloads.

## Install And Reload Flow

For Codex users:

```bash
codex plugin marketplace add mbanderas/maestro
codex plugin add maestro@maestro
```

After install/update:

1. Restart Codex Desktop/CLI, or open a new thread.
2. Type `/`.
3. Find `/maestro`.
4. Run `/maestro frontier off` or another command.

For manual project install:

```bash
npx github:mbanderas/maestro install --target codex --project .
```

## Claude Code Porting Note

Claude Code already has first-class slash command files in `commands/*.md`.
Keep Claude Code on `/maestro:<command>`:

```text
/maestro:frontier off
/maestro:settings status
/maestro:terse ultra
/maestro:update
```

Do not copy Codex skill routing into Claude Code unless building a skill-only
fallback. Claude Code native command files are the cleaner surface there.

## Other IDE Porting Pattern

Use runtime-native command files where available:

| Runtime | Preferred surface | Notes |
|---|---|---|
| Claude Code | Plugin `commands/*.md` | Real `/maestro:*` commands |
| Codex Desktop/CLI | Plugin skills | Direct `/maestro` via `name: maestro` |
| Cursor | `.cursor/commands/*.md` | Prompt-template command; no trusted hook parity |
| Gemini CLI | `.gemini/commands/*.toml` | Prompt-template command |
| Cline | `.cline/skills/*/SKILL.md` | Skill command pattern |
| Windsurf | Workflow markdown | Manual workflow shortcut |

Core rule: expose the branded command through the runtime's native command or
skill mechanism, but always call the same portable engine:

```bash
node bin/maestro.cjs frontier status --scope <runtime-scope>
node settings/cli.cjs status --scope <runtime-scope>
```

## Pitfalls

- Do not rely on `~/.codex/prompts` for direct `/maestro`; it yields
  `/prompts:*` commands.
- Do not hand-edit Frontier state files; run `maestro frontier ...`.
- Use `--scope codex-project` for Codex repo scope.
- Restart/new thread required after plugin or skill changes.
- Codex Desktop may not inherit shell env vars; put provider keys/binary
  overrides in `~/.codex/.env` when needed.

## Minimal Template For Another Codex Plugin

```text
my-plugin/
  .codex-plugin/plugin.json
  skills/
    my-command/
      SKILL.md
```

Manifest:

```json
{
  "name": "my-plugin",
  "version": "1.0.0",
  "skills": "./skills/"
}
```

Skill:

```markdown
---
name: my-command
description: Direct slash command for my plugin
---

Use this skill when user invokes `/my-command`.

Map `$ARGUMENTS` or trailing user text to exactly one operation.
Run the project-local CLI first; fall back to plugin-root CLI.
Verify by running status command after state changes.
```

Expected Codex surface after install/restart:

```text
/my-command ...
```
