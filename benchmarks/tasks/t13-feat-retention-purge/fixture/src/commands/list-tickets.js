'use strict';

const { allTickets } = require('../core/tickets.js');

function listTickets() {
  return allTickets().map((t) => `${t.id}  ${t.customerId}  ${t.status}  ${t.updatedAt}`);
}

module.exports = { listTickets };
