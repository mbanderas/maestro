'use strict';

// Hidden oracle for t15-feat-version-sort. Lands in the work dir only after
// the agent exits. Pristine fixture FAILS (sortVersions is a stub that
// throws); a correct SemVer-precedence implementation PASSES.
//
// The crafted versions below exercise the documented precedence rules that are
// NOT observable by running the CLI (list-packages sorts by name and never
// calls sortVersions):
//   - numeric core fields: 1.10.0 > 1.2.0 (a lexical sort gets this wrong);
//   - pre-release < release: 1.0.0-rc.1 < 1.0.0;
//   - numeric pre-release identifiers: alpha.2 < alpha.10 (not lexical);
//   - field-count rule: 1.0.0-alpha < 1.0.0-alpha.1;
//   - build metadata ignored for precedence but preserved in the string.
//
// No clock or timezone dependence: SemVer precedence is host-invariant, so a
// single in-process check is deterministic on every runner.

const path = require('node:path');
const { spawnSync } = require('node:child_process');

const node = process.execPath;

function fail(msg) {
  console.error('FAIL: ' + msg);
  process.exit(1);
}

// Ascending SemVer precedence. A correct impl must return exactly this order.
const EXPECTED = [
  '1.0.0-alpha',
  '1.0.0-alpha.1',
  '1.0.0-alpha.2',
  '1.0.0-alpha.10',
  '1.0.0-rc.1',
  '1.0.0',
  '1.2.0',
  '1.5.0+exp.sha.5114f85',
  '1.10.0',
  '2.0.0',
];

// Shuffled input. A no-op returning the input unchanged FAILS; a lexical sort
// FAILS (1.10.0 before 1.2.0, and 1.0.0 before its pre-releases); a numeric
// core-only sort that ignores pre-release tags FAILS (the five 1.0.0* tie and
// keep input order).
const INPUT = [
  '2.0.0',
  '1.0.0-alpha.10',
  '1.0.0',
  '1.10.0',
  '1.0.0-alpha',
  '1.5.0+exp.sha.5114f85',
  '1.0.0-rc.1',
  '1.2.0',
  '1.0.0-alpha.2',
  '1.0.0-alpha.1',
];

// Check 0: existing command keeps working (regression guard).
{
  const cli = path.join(__dirname, 'src', 'cli.js');
  const r = spawnSync(node, [cli, 'list-packages'], { encoding: 'utf8', cwd: __dirname });
  if (r.status !== 0) fail(`list-packages exited ${r.status}; stderr: ${(r.stderr || '').trim()}`);
  if (!r.stdout || !r.stdout.trim()) fail('list-packages produced no output');
}

// Load the implementation under test.
let sortVersions;
try {
  ({ sortVersions } = require('./src/core/versions.js'));
} catch (e) {
  fail('cannot require src/core/versions.js: ' + e.message);
}
if (typeof sortVersions !== 'function') fail('sortVersions is not a function');
if (sortVersions.length !== 1) fail(`sortVersions signature changed: arity ${sortVersions.length}, want 1`);

// Check 1: sort a copy; the impl must not mutate the caller's array.
const input = INPUT.map((s) => s);
let out;
try {
  out = sortVersions(input);
} catch (e) {
  fail('sortVersions threw (stub not implemented?): ' + e.message);
}
if (!Array.isArray(out)) fail(`sortVersions must return an array; got ${typeof out}`);

// Check 2: input not mutated.
if (input.length !== INPUT.length || input.some((v, i) => v !== INPUT[i])) {
  fail(`sortVersions mutated its input: ${JSON.stringify(input)}`);
}

// Check 3: output is a permutation of the input -- nothing dropped, added, or
// rewritten (build metadata must be preserved verbatim).
const sortedOut = out.slice().sort();
const sortedIn = INPUT.slice().sort();
if (sortedOut.length !== sortedIn.length || sortedOut.some((v, i) => v !== sortedIn[i])) {
  fail(`output is not a permutation of the input (entry dropped/added/rewritten): ${JSON.stringify(out)}`);
}

// Check 4: exact precedence order.
for (let i = 0; i < EXPECTED.length; i++) {
  if (out[i] !== EXPECTED[i]) {
    fail(`position ${i}: got ${JSON.stringify(out[i])}, want ${JSON.stringify(EXPECTED[i])} -- full: ${JSON.stringify(out)}`);
  }
}

// Check 5: no console.log in src/core (logging does not belong in the core).
{
  const fs = require('node:fs');
  const core = path.join(__dirname, 'src', 'core');
  for (const f of fs.readdirSync(core)) {
    if (!f.endsWith('.js')) continue;
    if (/console\.log/.test(fs.readFileSync(path.join(core, f), 'utf8'))) {
      fail(`console.log found in src/core/${f}`);
    }
  }
}

console.log('PASS');
