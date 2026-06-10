'use strict';

const { COMMANDS } = require('./commands/registry.js');

const name = process.argv[2];
const handler = COMMANDS[name];

if (!handler) {
  console.error(`unknown command: ${name}. available: ${Object.keys(COMMANDS).join(', ')}`);
  process.exit(2);
}

for (const line of handler()) {
  console.log(line);
}
