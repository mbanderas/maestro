'use strict';

const { listProducts } = require('./list-products.js');
const { listOrders } = require('./list-orders.js');
const { listCustomers } = require('./list-customers.js');
const { addProduct } = require('./add-product.js');
const { help } = require('./help.js');

const COMMANDS = {
  'list-products':  listProducts,
  'list-orders':    listOrders,
  'list-customers': listCustomers,
  'add-product':    addProduct,
  'help':           help,
};

module.exports = { COMMANDS };
