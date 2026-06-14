#!/usr/bin/env node
// Maestro Frontier — CLI integration tests. Subprocess-invoke only; no real spawns.

'use strict';

const { execFileSync } = require('child_process');
const fs   = require('fs');
const os   = require('os');
const path = require('path');

const cliPath = path.join(__dirname, 'cli.cjs');

// ---------- helpers ----------

const failures = [];

function check(label, cond, msg) {
  if (!cond) {
    failures.push(label + ': ' + (msg || 'FAILED'));
    process.stderr.write('FAIL  ' + label + (msg ? ': ' + msg : '') + '\n');
  } else {
    process.stdout.write('PASS  ' + label + '\n');
  }
}

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'frontier-cli-test-'));
}

function run(args, xdgDir, opts) {
  opts = opts || {};
  try {
    const stdout = execFileSync(
      process.execPath,
      [cliPath].concat(args),
      {
        env: { ...process.env, XDG_CONFIG_HOME: xdgDir },
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      }
    );
    return { code: 0, stdout, stderr: '' };
  } catch (e) {
    return {
      code: e.status != null ? e.status : 1,
      stdout: e.stdout || '',
      stderr: e.stderr || '',
    };
  }
}

// ---------- tests ----------

function runTests() {

  // (a) fresh dir -> status shows mode:off
  {
    const dir = makeTmpDir();
    const r = run(['status'], dir);
    check('(a) status exit 0', r.code === 0, 'exit code ' + r.code);
    check('(a) status contains mode:off', r.stdout.includes('"mode":"off"'),
      'stdout: ' + r.stdout.trim());
  }

  // (b) set fusion --preset opus-gpt, then status shows it
  {
    const dir = makeTmpDir();
    const r1 = run(['mode', 'fusion', '--preset', 'opus-gpt'], dir);
    check('(b) mode fusion exit 0', r1.code === 0, 'exit ' + r1.code + ' stderr: ' + r1.stderr.trim());
    const r2 = run(['status'], dir);
    check('(b) status shows fusion', r2.stdout.includes('fusion'), 'stdout: ' + r2.stdout.trim());
    check('(b) status shows opus-gpt', r2.stdout.includes('opus-gpt'), 'stdout: ' + r2.stdout.trim());
  }

  // (c) run hello while mode off -> stdout "Frontier off", exit 0
  {
    const dir = makeTmpDir();
    const r = run(['run', 'hello'], dir);
    check('(c) run off exit 0', r.code === 0, 'exit code ' + r.code);
    check('(c) run off stdout', r.stdout.includes('Frontier off'), 'stdout: ' + r.stdout.trim());
  }

  // (d) mode single with no --model -> exit 2
  {
    const dir = makeTmpDir();
    const r = run(['mode', 'single'], dir);
    check('(d) single no model exit 2', r.code === 2, 'exit code ' + r.code);
  }

  // ---------- report ----------
  if (failures.length === 0) {
    process.stdout.write('\nAll 4 CLI cases passed.\n');
    process.exit(0);
  } else {
    process.stderr.write('\n' + failures.length + ' failure(s):\n');
    failures.forEach(f => process.stderr.write('  ' + f + '\n'));
    process.exit(1);
  }
}

runTests();
