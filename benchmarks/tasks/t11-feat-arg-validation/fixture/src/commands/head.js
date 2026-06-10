'use strict';

// head: returns the first N characters of a string
// SEEDED AD-HOC VALIDATION -- must be removed by the agent

const name = 'head';
const description = 'Return the first N characters of a string.';

function run(args) {
  const n = parseInt(args[1], 10);
  if (isNaN(n) || n < 1) throw new Error('n must be a positive-int');
  return args[0].slice(0, n);
}

module.exports = { name, description, run };
