---
name: maestro-terse
description: Toggle Maestro terse output level (lite, full, ultra, off) via the settings CLI
---

Toggle the **Maestro terse** output level for this environment. Terse mode
condenses agent replies; levels range from `off` (default verbosity) through
`lite`, `full`, and `ultra` (most compressed).

When the user invokes this skill, run the settings CLI to read or change the
terse level. Do not edit settings files by hand.

## Check current terse level

```bash
node settings/cli.cjs --help
```

Consult the help output for the exact read subcommand, then run it. If
`settings/cli.cjs` is not present, run `maestro --help` to discover the
correct path.

## Set terse level

```bash
node settings/cli.cjs terse <level>
```

Valid levels: `off` | `lite` | `full` | `ultra`

Examples:

```bash
node settings/cli.cjs terse off
node settings/cli.cjs terse lite
node settings/cli.cjs terse full
node settings/cli.cjs terse ultra
```

If the CLI rejects an argument or the subcommand name differs, run
`node settings/cli.cjs --help` first and follow the printed usage.

## Notes

- The change persists in Maestro's settings store; it applies to subsequent
  agent turns in this project.
- Requires `node` on `PATH` and Maestro installed in the project root. If
  `settings/cli.cjs` is missing, re-run the Maestro installer:
  `npx github:mbanderas/maestro install --target codex`
