'use strict';

// lower: converts a string to lower case

const name = 'lower';
const description = 'Convert a string to lower case.';

function run(args) {
  return args[0].toLowerCase();
}

module.exports = { name, description, run };
