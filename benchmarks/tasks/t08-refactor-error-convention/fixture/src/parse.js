'use strict';

function parseIntStrict(text) {
  if (!/^-?\d+$/.test(String(text))) {
    throw new Error('BAD_INT: not an integer');
  }
  return parseInt(text, 10);
}

module.exports = { parseIntStrict };
