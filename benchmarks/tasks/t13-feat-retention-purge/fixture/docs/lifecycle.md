# Destructive-command lifecycle contract

Any command that removes records from the dataset MUST obey this contract.

## 1. Dry-run by default

Without the `--apply` flag, a destructive command prints its plan and mutates
NOTHING on disk. The plan describes exactly what `--apply` would remove.

## 2. Plan format

Print one line per record that would be removed:

```
plan: purge <type> <id>
```

`<type>` is the singular record type: `customer`, `ticket`, or `comment`.

After the plan lines, print a final summary line:

- Dry-run (no `--apply`): `total: <n>` where `<n>` is the number of records.
- With `--apply`: perform the removal, print the same `plan:` lines, then
  print `applied: <n>` instead of the `total:` line.

## 3. Empty plan

If nothing qualifies for removal, print `total: 0` and exit with code 3
(nothing to do). This holds for both dry-run and `--apply`.

## 4. Retention window

A retention purge removes records older than a retention window (for example,
30 days). The binding window length is `config.retentionDays` — never a
hardcoded literal. What makes a record removable is defined in
`docs/data-model.md`.

## 5. Exit codes

| Code | Meaning |
|---|---|
| 0 | Success (plan printed, or removal applied) |
| 1 | Unexpected error |
| 2 | Usage error or unsupported value |
| 3 | No-op (nothing to do / empty plan) |
