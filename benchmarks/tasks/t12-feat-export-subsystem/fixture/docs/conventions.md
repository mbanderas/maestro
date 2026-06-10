# orderdesk conventions

## 1. Command modules

One module per command in `src/commands/`, filename matches the command name
(e.g. `list-products.js` for the `list-products` command). Every command module
is wired into `src/commands/registry.js`.

## 2. Subsystem command naming

Commands belonging to a subsystem are named `<subsystem>-<entity>` (kebab-case).
For example, a "report" subsystem operating on products would be `report-products`.

## 3. File-writing commands

Commands that write files place output in the directory named by `config.outputDir`
(default `'out'`; create it if missing). The filename is `<entity>.<extension>`,
e.g. `out/products.csv`.

## 4. --format flag

Commands that write files accept a `--format <value>` flag. Unsupported values
must throw `AppError` with `exitCode` 2 and a message starting with
`unsupported format:` (e.g. `unsupported format: xml`).

## 5. CSV format

First line is a header row with field names, comma-separated. One data row per
record. No quoting is required for the seed data values.

## 6. JSON format

Exported JSON is an array of the raw record objects, pretty-printed with a
2-space indent.

## 7. config.features

When a new subsystem is added, append its name to the `features` array in
`src/config.js`.

## 8. Documenting commands

Every user-facing command must have a row in `docs/commands.md`.

## 9. require order in registry.js

List requires in alphabetical order by command name for readability.

## 10. No production console.log

Use `process.stdout.write` or return line arrays from command functions;
never call `console.log` in library/core modules.
