'use strict';

// Wall-clock helpers for HUMAN-FACING order listings: they show the date as
// it appears in the order's own timezone. NOT for UTC reporting buckets --
// see docs/conventions.md (Reporting period).

// The year-month as written in the timestamp's own offset, e.g.
// '2026-01-31T23:30:00-05:00' -> '2026-01'. Ignores the offset by design.
function monthOf(iso) {
  return String(iso).slice(0, 7);
}

module.exports = { monthOf };
