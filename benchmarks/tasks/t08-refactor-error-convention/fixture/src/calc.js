'use strict';

function divide(a, b) {
  if (b === 0) {
    throw new Error('DIV_ZERO: division by zero');
  }
  return a / b;
}

module.exports = { divide };
