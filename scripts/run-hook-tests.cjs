#!/usr/bin/env node
// Runs every hooks/*.test.cjs and scripts/*.test.cjs in sequence.
// Zero dependencies. Exit 1 if any suite fails. Run: npm test
'use strict';

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

let failed = 0;

for (const dir of ['hooks', 'scripts', 'frontier']) {
  const abs = path.join(__dirname, '..', dir);
  for (const f of fs.readdirSync(abs).filter(f => f.endsWith('.test.cjs')).sort()) {
    console.log(`== ${dir}/${f}`);
    try {
      execFileSync(process.execPath, [path.join(abs, f)], { stdio: 'inherit' });
    } catch {
      failed++;
    }
  }
}

if (failed) { console.error(`${failed} suite(s) failed`); process.exit(1); }
console.log('all suites passed');
