# Conventions

Conventions every contribution to chrono-cli follows.

## Duration format

A duration string is **one or more `<integer><unit>` segments**, concatenated
with no separators, and the parsed value is the **sum** of the segments in
milliseconds.

Units and their millisecond values:

| unit | ms |
|---|---|
| `ms` | 1 |
| `s` | 1000 |
| `m` | 60000 |
| `h` | 3600000 |
| `d` | 86400000 |

Rules that are easy to get wrong:

1. **Compound durations sum.** `"1h30m"` is one hour plus thirty minutes =
   `5400000`, not just the first segment. A parser that reads a single
   `<number><unit>` and stops is wrong.
2. **`ms` is matched before `m`.** When tokenizing, the two-letter unit `ms`
   takes precedence over `m`: `"500ms"` is 500 milliseconds, NEVER 500 minutes.
   An unanchored `/(\d+)m/` scan splits `500ms` into `500m` + leftover `s` and
   is wrong.
3. **A bare integer with no unit is milliseconds.** `"250"` parses to `250`.
4. The whole string must be consumed by valid segments (or be a bare integer);
   otherwise the input is unparseable and `parseDuration` throws.

Do not parse with `parseInt(str)` plus a trailing-unit lookup (handles a single
segment only) or with an unanchored per-unit regex that mis-tokenizes `ms`.
