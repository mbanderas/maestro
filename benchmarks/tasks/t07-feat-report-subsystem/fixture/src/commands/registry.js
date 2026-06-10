'use strict';

const { listProducts } = require('./list-products.js');
const { listOrders } = require('./list-orders.js');

const COMMANDS = {
  'list-products': listProducts,
  'list-orders': listOrders,
};

module.exports = { COMMANDS };
