#!/usr/bin/env node
// Static checks on benchmark fixtures. Zero dependencies.
// Verifiers run against a completed work dir at bench time, so CI can
// only check them statically: node --check each verify.cjs, JSON-parse
// each task.json. Run: npm run bench-verify
'use strict';

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const tasksDir = path.join(__dirname, '..', 'benchmarks', 'tasks');
let failed = 0;

for (const task of fs.readdirSync(tasksDir).sort()) {
  const dir = path.join(tasksDir, task);
  if (!fs.statSync(dir).isDirectory()) continue;
  const verify = path.join(dir, 'verify.cjs');
  const taskJson = path.join(dir, 'task.json');
  try {
    execFileSync(process.execPath, ['--check', verify], { stdio: 'pipe' });
  } catch (e) {
    failed++;
    console.error(`FAIL syntax ${task}/verify.cjs: ${e.message}`);
  }
  try {
    JSON.parse(fs.readFileSync(taskJson, 'utf8'));
  } catch (e) {
    failed++;
    console.error(`FAIL parse ${task}/task.json: ${e.message}`);
  }
}

if (failed) { console.error(`${failed} fixture check(s) failed`); process.exit(1); }
console.log('all fixture checks passed');
