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
  // A command may return an array of lines, or { lines, exitCode } to print
  // lines on stdout and then exit with a specific code (see docs/lifecycle.md).
  const lines = Array.isArray(result) ? result : result && result.lines;
  if (lines) {
    for (const line of lines) {
      console.log(line);
    }
  }
  if (result && !Array.isArray(result) && typeof result.exitCode === 'number') {
    process.exit(result.exitCode);
  }
} catch (err) {
  if (err instanceof AppError) {
    process.stderr.write(`error: ${err.message}\n`);
    process.exit(err.exitCode);
  }
  throw err;
}
