'use strict';

// Lazy-requires registry to avoid circular dependency at module load time.
function help() {
  const { COMMANDS } = require('./registry.js');
  const names = Object.keys(COMMANDS).sort();
  return ['available commands:', ...names.map((n) => `  ${n}`)];
}

module.exports = { help };
