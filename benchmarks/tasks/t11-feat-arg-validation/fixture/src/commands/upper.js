'use strict';

// upper: converts a string to upper case

const name = 'upper';
const description = 'Convert a string to upper case.';

function run(args) {
  return args[0].toUpperCase();
}

module.exports = { name, description, run };
