'use strict';

function parseArgs(argv) {
  const opts = { message: 'hello', upper: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--upper') opts.upper = true;
    else if (arg === '--message') opts.message = argv[++i] ?? opts.message;
  }
  return opts;
}

module.exports = { parseArgs };
