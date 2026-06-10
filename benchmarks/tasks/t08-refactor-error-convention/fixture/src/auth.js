'use strict';

function checkToken(token) {
  if (!/^tk_[a-z0-9]+$/.test(String(token))) {
    throw new Error('BAD_TOKEN: token malformed');
  }
  return true;
}

module.exports = { checkToken };
