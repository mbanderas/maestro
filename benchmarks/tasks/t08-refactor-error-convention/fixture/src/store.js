'use strict';

const DATA = new Map();

function set(key, value) {
  DATA.set(key, value);
}

function get(key) {
  if (!DATA.has(key)) {
    throw new Error('MISSING_KEY: no such key');
  }
  return DATA.get(key);
}

module.exports = { set, get };
