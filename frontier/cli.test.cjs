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

  // (e) fusion --preset gpt-duo -> status shows gpt-duo
  {
    const dir = makeTmpDir();
    const r1 = run(['mode', 'fusion', '--preset', 'gpt-duo'], dir);
    check('(e) gpt-duo exit 0', r1.code === 0, 'exit ' + r1.code + ' stderr: ' + r1.stderr.trim());
    const r2 = run(['status'], dir);
    check('(e) status shows gpt-duo', r2.stdout.includes('gpt-duo'), 'stdout: ' + r2.stdout.trim());
  }

  // (f) fusion --judge/--synth overrides persist in state
  {
    const dir = makeTmpDir();
    const r1 = run(['mode', 'fusion', '--preset', 'opus-gpt', '--judge', 'gpt-5.5', '--synth', 'gemini'], dir);
    check('(f) override exit 0', r1.code === 0, 'exit ' + r1.code + ' stderr: ' + r1.stderr.trim());
    const r2 = run(['status'], dir);
    check('(f) status judgeModel', r2.stdout.includes('"judgeModel":"gpt-5.5"'), 'stdout: ' + r2.stdout.trim());
    check('(f) status synthModel', r2.stdout.includes('"synthModel":"gemini"'), 'stdout: ' + r2.stdout.trim());
  }

  // (g) unknown --judge model -> exit 2
  {
    const dir = makeTmpDir();
    const r = run(['mode', 'fusion', '--preset', 'opus-gpt', '--judge', 'bogus'], dir);
    check('(g) bad judge exit 2', r.code === 2, 'exit code ' + r.code);
  }

  // (g2) chatgpt and chatgpt-duo aliases persist as canonical old names
  {
    const dir = makeTmpDir();
    const r1 = run(['mode', 'fusion', '--preset', 'chatgpt-duo', '--judge', 'chatgpt', '--synth', 'chatgpt'], dir);
    check('(g2) chatgpt aliases exit 0', r1.code === 0, 'exit ' + r1.code + ' stderr: ' + r1.stderr.trim());
    const r2 = run(['status'], dir);
    check('(g2) preset alias canonical', r2.stdout.includes('"preset":"gpt-duo"'), 'stdout: ' + r2.stdout.trim());
    check('(g2) judge alias canonical', r2.stdout.includes('"judgeModel":"gpt-5.5"'), 'stdout: ' + r2.stdout.trim());
    check('(g2) synth alias canonical', r2.stdout.includes('"synthModel":"gpt-5.5"'), 'stdout: ' + r2.stdout.trim());
  }

  // (h) adopt: legacy global state -> per-workspace cc-* scope
  {
    const dir = makeTmpDir();
    fs.mkdirSync(path.join(dir, 'maestro'), { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'maestro', 'frontier-state.json'),
      JSON.stringify({ mode: 'fusion', preset: 'opus-duo' }), 'utf8');

    // Explicit --scope so the test is deterministic regardless of host env.
    const r1 = run(['adopt', '--scope', 'cc-test1234'], dir);
    check('(h) adopt exit 0', r1.code === 0, 'exit ' + r1.code + ' stderr: ' + r1.stderr.trim());
    check('(h) adopt reports opus-duo', r1.stdout.includes('opus-duo'), 'stdout: ' + r1.stdout.trim());

    const r2 = run(['status', '--scope', 'cc-test1234'], dir);
    check('(h) adopted scope round-trips', r2.stdout.includes('opus-duo'), 'stdout: ' + r2.stdout.trim());

    // Re-adopt without --force refused.
    const r3 = run(['adopt', '--scope', 'cc-test1234'], dir);
    check('(h) re-adopt refused exit 2', r3.code === 2, 'exit code ' + r3.code);
    check('(h) refusal names exists', r3.stderr.includes('exists'), 'stderr: ' + r3.stderr.trim());

    // Non-cc scope refused.
    const r4 = run(['adopt', '--scope', 'codex'], dir);
    check('(h) adopt non-cc scope exit 2', r4.code === 2, 'exit code ' + r4.code);
    check('(h) refusal names not-cc-scope', r4.stderr.includes('not-cc-scope'), 'stderr: ' + r4.stderr.trim());

    // No legacy global state present -> missing-legacy, exit 2.
    const dir2 = makeTmpDir();
    const r5 = run(['adopt', '--scope', 'cc-test9999'], dir2);
    check('(h) adopt missing legacy exit 2', r5.code === 2, 'exit code ' + r5.code);
    check('(h) refusal names missing-legacy', r5.stderr.includes('missing-legacy'), 'stderr: ' + r5.stderr.trim());
  }

  // ---------- report ----------
  if (failures.length === 0) {
    process.stdout.write('\nAll CLI cases passed.\n');
    process.exit(0);
  } else {
    process.stderr.write('\n' + failures.length + ' failure(s):\n');
    failures.forEach(f => process.stderr.write('  ' + f + '\n'));
    process.exit(1);
  }
}

runTests();
