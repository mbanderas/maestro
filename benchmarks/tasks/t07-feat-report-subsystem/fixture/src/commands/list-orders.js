'use strict';

const { allOrders, orderTotal } = require('../core/orders.js');

function listOrders() {
  return allOrders().map((o) => `${o.id} ${o.customerId} $${orderTotal(o).toFixed(2)}`);
}

module.exports = { listOrders };
