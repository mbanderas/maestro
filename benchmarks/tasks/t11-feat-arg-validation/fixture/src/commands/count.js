'use strict';

// count: counts characters in a string

const name = 'count';
const description = 'Count the number of characters in a string.';

function run(args) {
  return String(args[0].length);
}

module.exports = { name, description, run };
