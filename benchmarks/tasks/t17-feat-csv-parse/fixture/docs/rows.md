# Rows subsystem

The CSV-inspection subsystem is landing in two phases.

- **Phase 1 (this change): the `parseCsvLine` parser** in `src/core/csv.js`.
  A pure function from one CSV line to an array of field strings.
- Phase 2 (later): column projection and filtering built on the parser.

## `parseCsvLine(line)` contract

- Input: a single CSV record (one line, no trailing newline).
- Output: an array of field strings, decoded per [conventions](conventions.md)
  (quoted fields unwrapped, `""` unescaped to `"`, embedded commas preserved).
- Pure: no mutation, no I/O.

The exported signature (`parseCsvLine(line)`) must not change.

The `show-rows` command renders each row through this parser; while the parser
is unimplemented it echoes the raw line, so the command keeps working.
