'use strict';

const { allProducts } = require('../core/products.js');

function listProducts() {
  return allProducts().map((p) => `${p.id}  ${p.name}  $${p.price.toFixed(2)}`);
}

module.exports = { listProducts };
