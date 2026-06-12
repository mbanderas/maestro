#!/usr/bin/env node
// Runs every hooks/*.test.cjs in sequence. Zero dependencies.
// Exit 1 if any suite fails. Run: npm test
'use strict';

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const hooksDir = path.join(__dirname, '..', 'hooks');
let failed = 0;

for (const f of fs.readdirSync(hooksDir).filter(f => f.endsWith('.test.cjs')).sort()) {
  console.log(`== ${f}`);
  try {
    execFileSync(process.execPath, [path.join(hooksDir, f)], { stdio: 'inherit' });
  } catch {
    failed++;
  }
}

if (failed) { console.error(`${failed} suite(s) failed`); process.exit(1); }
console.log('all suites passed');
