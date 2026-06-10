'use strict';

const PRODUCTS = [
  { id: 'p1', name: 'Widget', price: 2.5 },
  { id: 'p2', name: 'Gadget', price: 10 },
  { id: 'p3', name: 'Gizmo', price: 4 },
];

function allProducts() {
  return PRODUCTS.slice();
}

function productById(id) {
  return PRODUCTS.find((p) => p.id === id) || null;
}

module.exports = { allProducts, productById };
