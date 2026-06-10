'use strict';

// mul: multiplies two integers
// SEEDED AD-HOC VALIDATION -- must be removed by the agent

const name = 'mul';
const description = 'Multiply two integers together.';

function run(args) {
  if (typeof args[0] !== 'number') throw new Error('a must be a number');
  if (typeof args[1] !== 'number') throw new Error('b must be a number');
  return String(args[0] * args[1]);
}

module.exports = { name, description, run };
