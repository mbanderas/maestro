# Reporting subsystem

The reporting subsystem is landing in two phases.

- **Phase 1 (this change): the `revenueByMonth` rollup** in
  `src/core/revenue.js`. A pure function over an orders array; no CLI yet.
- Phase 2 (later): a `revenue-by-month` command that prints the rollup.

## `revenueByMonth(orders)` contract

- Input: an array of order records (see `src/core/orders.js` for the shape;
  `placedAt`, `amountCents`, `status`).
- Output: an array of `{ month, cents }` objects, where `month` is a
  `"YYYY-MM"` string (UTC, per [conventions](conventions.md)) and `cents`
  is the integer sum of included orders' `amountCents` in that month.
- Sorted ascending by `month`.
- Months with no included revenue are omitted entirely.
- Excluded statuses (`cancelled`, `refunded`) do not contribute.

The exported signature (`revenueByMonth(orders)`) must not change.
