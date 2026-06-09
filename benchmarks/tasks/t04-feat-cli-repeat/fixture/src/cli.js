'use strict';

const { parseArgs } = require('./args');

const opts = parseArgs(process.argv.slice(2));
const text = opts.upper ? opts.message.toUpperCase() : opts.message;
process.stdout.write(text + '\n');
