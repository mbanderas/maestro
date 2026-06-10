'use strict';

const { productById } = require('./products.js');

const ORDERS = [
  { id: 'o01', customerId: 'c1', items: [{ productId: 'p1', qty: 3 }, { productId: 'p2', qty: 1 }] },
  { id: 'o02', customerId: 'c2', items: [{ productId: 'p3', qty: 2 }] },
  { id: 'o03', customerId: 'c1', items: [{ productId: 'p4', qty: 1 }, { productId: 'p5', qty: 4 }] },
  { id: 'o04', customerId: 'c3', items: [{ productId: 'p6', qty: 5 }] },
  { id: 'o05', customerId: 'c4', items: [{ productId: 'p7', qty: 2 }] },
  { id: 'o06', customerId: 'c2', items: [{ productId: 'p8', qty: 1 }] },
  { id: 'o07', customerId: 'c5', items: [{ productId: 'p1', qty: 6 }] },
  { id: 'o08', customerId: 'c3', items: [{ productId: 'p2', qty: 2 }, { productId: 'p3', qty: 1 }] },
  { id: 'o09', customerId: 'c4', items: [{ productId: 'p5', qty: 3 }] },
  { id: 'o10', customerId: 'c1', items: [{ productId: 'p8', qty: 1 }] },
];

function allOrders() {
  return ORDERS.slice();
}

function orderTotal(order) {
  return order.items.reduce((sum, it) => sum + productById(it.productId).price * it.qty, 0);
}

module.exports = { allOrders, orderTotal };
