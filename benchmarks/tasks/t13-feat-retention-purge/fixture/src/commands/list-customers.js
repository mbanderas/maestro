'use strict';

const { allCustomers } = require('../core/customers.js');

function listCustomers() {
  return allCustomers().map((c) => `${c.id}  ${c.name}  ${c.email}`);
}

module.exports = { listCustomers };
