# Conventions

Conventions every contribution to ledger-cli follows.

## Currency

All monetary amounts are stored and computed as **integer cents**
(`amountCents`). Never represent money as floating-point dollars in
calculations: summing dollars and multiplying by 100 introduces rounding
error. Sum cents as integers; convert to a dollar string only at display
time (`src/lib/money.js`).

## Reporting period

Reports bucket orders into **calendar months in UTC**.

Order timestamps (`placedAt`) are ISO 8601 strings that carry a timezone
offset (e.g. `2026-01-31T23:30:00-05:00`). The offset is significant: an
order placed late on Jan 31 at `-05:00` falls in **February** in UTC. A
reporting bucket MUST be derived by normalizing the instant to UTC — for
example `new Date(placedAt)` and the `getUTCFullYear` / `getUTCMonth`
accessors.

Do **not** derive a reporting bucket by reading the wall-clock date off the
string (e.g. slicing `YYYY-MM` out of the raw text, or `src/lib/dates.js`'s
`monthOf`). `monthOf` is wall-clock only and exists for human-facing order
listings where the customer's local date is what should be shown; it is
wrong for UTC reporting.

## Excluded statuses

Revenue counts settled money only. Orders whose `status` is `cancelled` or
`refunded` are excluded from every revenue figure. Other statuses
(`paid`, `pending`) are included.
