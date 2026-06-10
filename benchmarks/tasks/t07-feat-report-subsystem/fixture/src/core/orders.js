'use strict';

const { productById } = require('./products.js');

const ORDERS = [
  { id: 'o1', customerId: 'c1', items: [{ productId: 'p1', qty: 4 }, { productId: 'p2', qty: 1 }] },
  { id: 'o2', customerId: 'c2', items: [{ productId: 'p3', qty: 2 }] },
  { id: 'o3', customerId: 'c1', items: [{ productId: 'p2', qty: 2 }] },
];

function allOrders() {
  return ORDERS.slice();
}

function orderTotal(order) {
  return order.items.reduce((sum, it) => sum + productById(it.productId).price * it.qty, 0);
}

module.exports = { allOrders, orderTotal };
