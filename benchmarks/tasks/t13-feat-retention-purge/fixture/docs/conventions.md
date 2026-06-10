# ticketdesk conventions

## 1. Command modules

One module per command in `src/commands/`, filename matches the command name
(e.g. `list-tickets.js` for the `list-tickets` command). Every command module
is wired into `src/commands/registry.js`.

## 2. Command naming

Commands are named `<verb>-<entity>` (kebab-case), e.g. `list-tickets`,
`add-comment`. A command family that introduces a new capability also records
that capability (see §6).

## 3. Data access

Records live in JSON files under the directory named by `config.dataDir`
(default `'data'`). Core modules in `src/core/` load and save these files;
commands never read or write the files directly.

## 4. require order in registry.js

List requires in alphabetical order by command name for readability, and key
the `COMMANDS` map in the same order.

## 5. Documenting commands

Every user-facing command must have a row in `docs/commands.md`.

## 6. config.features

When a new command family is added, append its capability name to the
`features` array in `src/config.js` (for example, a purge family adds
`'purge'`).

## 7. No production console.log

Use `process.stdout.write` or return line arrays from command functions;
never call `console.log` in `src/core/` or `src/lib/` modules.

## 8. Destructive commands

Destructive commands (those that remove records) MUST follow the lifecycle
contract in `docs/lifecycle.md`. Data-integrity rules for what counts as
removable, and what must cascade, are defined in `docs/data-model.md`.
