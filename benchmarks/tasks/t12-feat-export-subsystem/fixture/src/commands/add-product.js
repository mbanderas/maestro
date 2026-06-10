'use strict';

const { AppError } = require('../lib/errors.js');

// In-session product additions (not persisted across runs).
const added = [];

function addProduct(args) {
  const [id, name, priceStr] = args;
  if (!id || !name || !priceStr) {
    throw new AppError('usage: add-product <id> <name> <price>', 2);
  }
  const price = parseFloat(priceStr);
  if (isNaN(price)) {
    throw new AppError('price must be a number', 2);
  }
  added.push({ id, name, price });
  return [`added product ${id}`];
}

module.exports = { addProduct };
