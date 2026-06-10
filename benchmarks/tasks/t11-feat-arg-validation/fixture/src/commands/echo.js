'use strict';

// echo: returns the input string unchanged

const name = 'echo';
const description = 'Echo a string back unchanged.';

function run(args) {
  return args[0];
}

module.exports = { name, description, run };
