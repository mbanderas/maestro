'use strict';

const registry = require('./commands/index.js');

function dispatch(argv) {
  const [cmdName, ...args] = argv;
  const cmd = registry[cmdName];
  if (!cmd) {
    return 'error: unknown command: ' + cmdName;
  }
  try {
    return cmd.run(args);
  } catch (err) {
    return 'error: ' + err.message;
  }
}

module.exports = { dispatch };
