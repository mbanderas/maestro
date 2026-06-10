'use strict';

// add: adds two integers
// SEEDED AD-HOC VALIDATION -- must be removed by the agent

const name = 'add';
const description = 'Add two integers together.';

function run(args) {
  const a = parseInt(args[0], 10);
  const b = parseInt(args[1], 10);
  if (isNaN(a)) throw new Error('a is not a valid integer');
  if (isNaN(b)) throw new Error('b is not a valid integer');
  return String(a + b);
}

module.exports = { name, description, run };
