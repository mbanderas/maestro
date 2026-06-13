'use strict';

function help() {
  console.log('ledger <command>');
  console.log('  help          show this help');
  console.log('  list-orders   list orders with wall-clock month and amount');
}

module.exports = { help };
