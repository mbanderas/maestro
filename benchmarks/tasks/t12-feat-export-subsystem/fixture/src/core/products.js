'use strict';

const PRODUCTS = [
  { id: 'p1',  name: 'Widget',      price: 2.50 },
  { id: 'p2',  name: 'Gadget',      price: 10.00 },
  { id: 'p3',  name: 'Gizmo',       price: 4.00 },
  { id: 'p4',  name: 'Doohickey',   price: 7.50 },
  { id: 'p5',  name: 'Thingamajig', price: 3.25 },
  { id: 'p6',  name: 'Whatsit',     price: 1.99 },
  { id: 'p7',  name: 'Doodad',      price: 5.50 },
  { id: 'p8',  name: 'Contraption', price: 12.00 },
];

function allProducts() {
  return PRODUCTS.slice();
}

function productById(id) {
  return PRODUCTS.find((p) => p.id === id) || null;
}

module.exports = { allProducts, productById };
