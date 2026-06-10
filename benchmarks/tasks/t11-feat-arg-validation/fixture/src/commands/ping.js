'use strict';

// ping: takes no arguments, returns "pong"

const name = 'ping';
const description = 'Responds with pong. Takes no arguments.';

function run(args) {
  return 'pong';
}

module.exports = { name, description, run };
