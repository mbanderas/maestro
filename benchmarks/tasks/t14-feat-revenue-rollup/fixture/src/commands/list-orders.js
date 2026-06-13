'use strict';

const { loadOrders } = require('../core/orders.js');
const { monthOf } = require('../lib/dates.js');
const { formatCents } = require('../lib/money.js');

// Human-facing listing: shows each order's wall-clock month (the customer's
// local date), so monthOf is correct here -- this is not a UTC report.
function listOrders() {
  for (const o of loadOrders()) {
    console.log(`${o.id}\t${monthOf(o.placedAt)}\t${formatCents(o.amountCents)}\t${o.status}`);
  }
}

module.exports = { listOrders };
