'use strict';

// Monthly revenue rollup. See docs/reporting.md for the contract and
// docs/conventions.md for the period / currency / excluded-status rules.
//
// Returns an array of { month: 'YYYY-MM', cents: integer }, UTC months,
// sorted ascending, zero-revenue months omitted, cancelled/refunded
// excluded.
function revenueByMonth(orders) {
  throw new Error('revenueByMonth: not implemented');
}

module.exports = { revenueByMonth };
