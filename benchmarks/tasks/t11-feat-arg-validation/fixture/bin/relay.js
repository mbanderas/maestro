#!/usr/bin/env node
'use strict';

const { dispatch } = require('../src/dispatch.js');

const argv = process.argv.slice(2);
if (argv.length === 0) {
  console.error('usage: relay <command> [args...]');
  process.exit(1);
}

const result = dispatch(argv);
console.log(result);
