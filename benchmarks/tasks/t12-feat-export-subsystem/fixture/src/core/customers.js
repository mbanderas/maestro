'use strict';

const CUSTOMERS = [
  { id: 'c1', name: 'Alice',   email: 'alice@example.com' },
  { id: 'c2', name: 'Bob',     email: 'bob@example.com' },
  { id: 'c3', name: 'Carol',   email: 'carol@example.com' },
  { id: 'c4', name: 'Dave',    email: 'dave@example.com' },
  { id: 'c5', name: 'Eve',     email: 'eve@example.com' },
];

function allCustomers() {
  return CUSTOMERS.slice();
}

function customerById(id) {
  return CUSTOMERS.find((c) => c.id === id) || null;
}

module.exports = { allCustomers, customerById };
