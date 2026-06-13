#!/usr/bin/env node
'use strict';

const { COMMANDS } = require('./commands/registry.js');

function main(argv) {
  const name = argv[0] || 'help';
  const handler = COMMANDS[name];
  if (!handler) {
    console.error(`unknown command: ${name}`);
    process.exit(2);
  }
  handler();
}

main(process.argv.slice(2));
