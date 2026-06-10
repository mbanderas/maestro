'use strict';

// split: splits a string on a separator, returns joined with newlines

const name = 'split';
const description = 'Split a string by a separator and return parts joined by newlines.';

function run(args) {
  return args[0].split(args[1]).join('\n');
}

module.exports = { name, description, run };
