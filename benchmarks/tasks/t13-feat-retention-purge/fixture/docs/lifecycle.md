# Destructive-command lifecycle contract

Any command that removes or moves records out of the live dataset is
destructive and must follow the same lifecycle contract as the existing
destructive commands.

`archive-tickets` (`src/commands/archive-tickets.js`) is the reference
implementation: study it for the dry-run behavior, the plan output format,
the summary lines, the empty-plan behavior, and the exit codes. New
destructive commands must behave identically, differing only in their
action word and selection rule.

The binding selection windows live in `src/config.js` — never a hardcoded
literal. What qualifies a record for removal is defined in
`docs/data-model.md`.
