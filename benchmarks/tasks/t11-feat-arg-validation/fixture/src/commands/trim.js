'use strict';

// trim: trims whitespace from both ends of a string

const name = 'trim';
const description = 'Trim whitespace from both ends of a string.';

function run(args) {
  return args[0].trim();
}

module.exports = { name, description, run };
