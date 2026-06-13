'use strict';

const fs = require('node:fs');
const path = require('node:path');

// Order record shape:
//   { id: string, placedAt: ISO-8601-with-offset string,
//     amountCents: integer, status: 'paid'|'pending'|'cancelled'|'refunded' }

function loadOrders() {
  const file = path.join(__dirname, '..', '..', 'data', 'orders.json');
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

module.exports = { loadOrders };
