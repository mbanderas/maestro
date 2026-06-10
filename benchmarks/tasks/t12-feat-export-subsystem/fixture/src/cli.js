'use strict';

const { COMMANDS } = require('./commands/registry.js');
const { AppError } = require('./lib/errors.js');

const [, , name, ...rest] = process.argv;

const handler = COMMANDS[name];

if (!handler) {
  process.stderr.write(
    `unknown command: ${name}. available: ${Object.keys(COMMANDS).join(', ')}\n`
  );
  process.exit(1);
}

try {
  const result = handler(rest);
  if (result) {
    for (const line of result) {
      console.log(line);
    }
  }
} catch (err) {
  if (err instanceof AppError) {
    process.stderr.write(`error: ${err.message}\n`);
    process.exit(err.exitCode);
  }
  throw err;
}
