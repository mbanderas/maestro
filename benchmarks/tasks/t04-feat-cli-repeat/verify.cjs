'use strict';

const assert = require('node:assert');
const { execFileSync } = require('node:child_process');
const path = require('node:path');

const cli = path.join(__dirname, 'src', 'cli.js');

function run(args) {
  const out = execFileSync(process.execPath, [cli, ...args], { encoding: 'utf8' });
  return out.replace(/\r\n/g, '\n').replace(/\n+$/, '').split('\n');
}

try {
  assert.deepStrictEqual(run(['--message', 'hi', '--repeat', '3']), ['hi', 'hi', 'hi'], 'repeat 3');
  assert.deepStrictEqual(run(['--repeat', '2', '--upper', '--message', 'ab']), ['AB', 'AB'], 'repeat with upper');
  assert.deepStrictEqual(run([]), ['hello'], 'defaults unchanged');
  assert.deepStrictEqual(run(['--message', 'x']), ['x'], 'message flag unchanged');
  assert.deepStrictEqual(run(['--message', 'y', '--repeat', 'bogus']), ['y'], 'invalid repeat falls back to 1');
  console.log('PASS');
} catch (err) {
  console.error('FAIL: ' + err.message);
  process.exit(1);
}
