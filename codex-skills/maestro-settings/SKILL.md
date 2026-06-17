---
name: maestro-settings
description: View and change Maestro toggles (terse, frontier, context-bar) via the settings CLI
---

View or change **Maestro settings** for this project. The settings CLI manages
the three primary toggles: `terse`, `frontier`, and `context-bar`.

When the user invokes this skill, run the settings CLI from the repo root.
Do not edit settings files by hand.

## Command launcher

Use `node settings/cli.cjs` when Maestro is installed in the project root. If
that file is not present and this skill is loaded from the Maestro Codex
plugin, locate the plugin root by walking up from this `SKILL.md` until
`.codex-plugin/plugin.json` is present, then run:

```bash
node "<maestro-plugin-root>/settings/cli.cjs" ...
```

## Discover available commands

```bash
node settings/cli.cjs --help
```

If `settings/cli.cjs` is not present, use the plugin-root launcher above.

## Common operations

List current settings:

```bash
node settings/cli.cjs
```

Set a toggle:

```bash
node settings/cli.cjs terse <off|lite|full|ultra>
node settings/cli.cjs frontier <off|single|fusion>
node settings/cli.cjs context-bar <on|off>
```

If a subcommand name or argument differs from the above, follow the usage
printed by `--help` — do not guess flags.

## Notes

- Changes persist in Maestro's settings store and apply to subsequent agent
  turns in this project.
- Requires `node` on `PATH`. A project-local Maestro install is optional when
  the skill is loaded from the Maestro Codex plugin.
