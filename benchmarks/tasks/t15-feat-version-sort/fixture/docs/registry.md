# Registry subsystem

The package-registry subsystem is landing in two phases.

- **Phase 1 (this change): the `sortVersions` precedence sort** in
  `src/core/versions.js`. A pure function over an array of version strings; no
  CLI yet.
- Phase 2 (later): a `list-versions` command that prints versions in precedence
  order.

## `sortVersions(versions)` contract

- Input: an array of SemVer version strings (e.g. `"1.2.0"`, `"1.0.0-rc.1"`,
  `"1.5.0+build.7"`).
- Output: a new array of the SAME strings sorted ascending by SemVer
  precedence (per [conventions](conventions.md)). Each original string is
  preserved verbatim — build metadata is NOT stripped from the returned value.
- The input array must not be mutated.

The exported signature (`sortVersions(versions)`) must not change.
