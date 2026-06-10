'use strict';

const CUSTOMERS = [
  { id: 'c1', name: 'Ada' },
  { id: 'c2', name: 'Bo' },
];

function allCustomers() {
  return CUSTOMERS.slice();
}

function customerById(id) {
  return CUSTOMERS.find((c) => c.id === id) || null;
}

module.exports = { allCustomers, customerById };
