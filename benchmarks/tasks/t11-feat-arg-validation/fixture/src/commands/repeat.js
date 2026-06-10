'use strict';

// repeat: repeats a string N times
// SEEDED AD-HOC VALIDATION -- must be removed by the agent

const name = 'repeat';
const description = 'Repeat a string a given number of times.';

function run(args) {
  const n = parseInt(args[1], 10);
  if (isNaN(n) || n < 1) throw new Error('times must be a positive integer');
  return args[0].repeat(n);
}

module.exports = { name, description, run };
