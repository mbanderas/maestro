'use strict';

// wrap: wraps a string with a prefix and suffix

const name = 'wrap';
const description = 'Wrap a string with a given prefix and suffix.';

function run(args) {
  return args[1] + args[0] + args[2];
}

module.exports = { name, description, run };
