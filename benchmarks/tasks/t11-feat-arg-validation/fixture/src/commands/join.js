'use strict';

// join: joins two strings with a separator

const name = 'join';
const description = 'Join two strings with a separator between them.';

function run(args) {
  return args[0] + args[1] + args[2];
}

module.exports = { name, description, run };
