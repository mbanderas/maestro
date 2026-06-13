'use strict';

const { listOrders } = require('./list-orders.js');
const { help } = require('./help.js');

// Command name -> handler. Keep keys alphabetical.
const COMMANDS = {
  help: help,
  'list-orders': listOrders,
};

module.exports = { COMMANDS };
