'use strict';

// tail: returns the last N characters of a string

const name = 'tail';
const description = 'Return the last N characters of a string.';

function run(args) {
  const n = args[1];
  return args[0].slice(-n);
}

module.exports = { name, description, run };
