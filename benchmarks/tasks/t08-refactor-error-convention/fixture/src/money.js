'use strict';

function toCents(amount) {
  if (amount < 0) {
    throw new Error('NEG_AMOUNT: amount below zero');
  }
  return Math.round(amount * 100);
}

module.exports = { toCents };
