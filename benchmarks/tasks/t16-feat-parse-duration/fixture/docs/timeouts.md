# Timeout subsystem

The timeout-config subsystem is landing in two phases.

- **Phase 1 (this change): the `parseDuration` parser** in
  `src/core/duration.js`. A pure function from a duration string to an integer
  number of milliseconds.
- Phase 2 (later): timeout values consumed by the client layer.

## `parseDuration(str)` contract

- Input: a duration string in the format described in
  [conventions](conventions.md) (e.g. `"30s"`, `"1h30m"`, `"500ms"`, `"250"`).
- Output: a non-negative **integer** number of milliseconds.
- Pure: no mutation, no I/O. Throw on an unparseable input.

The exported signature (`parseDuration(str)`) must not change.

The `show-timeouts` command renders the configured timeouts through this
parser; while the parser is unimplemented it echoes raw values, so the command
keeps working.
