'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const srcDir = path.join(__dirname, 'src');

function expectAppError(AppError, fn, code, message, label) {
  let caught = null;
  try {
    fn();
  } catch (err) {
    caught = err;
  }
  assert.ok(caught, `${label}: throws`);
  assert.ok(caught instanceof AppError, `${label}: instanceof AppError`);
  assert.ok(caught instanceof Error, `${label}: instanceof Error`);
  assert.strictEqual(caught.name, 'AppError', `${label}: name`);
  assert.strictEqual(caught.code, code, `${label}: code`);
  assert.strictEqual(caught.message, message, `${label}: message has no prefix`);
}

try {
  const { AppError } = require('./src/errors.js');
  assert.strictEqual(typeof AppError, 'function', 'AppError exported from src/errors.js');

  const lib = require('./src/index.js');
  assert.strictEqual(lib.AppError, AppError, 'AppError re-exported from barrel');

  assert.strictEqual(lib.validateName(' Bo '), 'Bo', 'validateName success');
  assert.strictEqual(lib.parseIntStrict('42'), 42, 'parseIntStrict success');
  assert.strictEqual(lib.toCents(1.25), 125, 'toCents success');
  assert.strictEqual(lib.clamp(5, 1, 10), 5, 'clamp success');
  lib.set('k', 'v');
  assert.strictEqual(lib.get('k'), 'v', 'store roundtrip');
  assert.strictEqual(lib.checkToken('tk_abc'), true, 'checkToken success');
  assert.strictEqual(lib.padLeft('7', 3), '  7', 'padLeft success');
  assert.strictEqual(lib.divide(10, 4), 2.5, 'divide success');
  assert.strictEqual(lib.parseIso('2026-06-10').getTime(), Date.UTC(2026, 5, 10), 'parseIso success');

  expectAppError(AppError, () => lib.validateName(''), 'EMPTY_NAME', 'name required', 'validateName');
  expectAppError(AppError, () => lib.parseIntStrict('x'), 'BAD_INT', 'not an integer', 'parseIntStrict');
  expectAppError(AppError, () => lib.toCents(-1), 'NEG_AMOUNT', 'amount below zero', 'toCents');
  expectAppError(AppError, () => lib.clamp(1, 10, 2), 'BAD_RANGE', 'min above max', 'clamp');
  expectAppError(AppError, () => lib.get('nope'), 'MISSING_KEY', 'no such key', 'get');
  expectAppError(AppError, () => lib.checkToken('abc'), 'BAD_TOKEN', 'token malformed', 'checkToken');
  expectAppError(AppError, () => lib.padLeft('x', 0), 'BAD_WIDTH', 'width must be positive', 'padLeft');
  expectAppError(AppError, () => lib.divide(1, 0), 'DIV_ZERO', 'division by zero', 'divide');
  expectAppError(AppError, () => lib.parseIso('junk'), 'BAD_DATE', 'not an ISO date', 'parseIso');

  for (const file of fs.readdirSync(srcDir)) {
    if (file === 'errors.js') continue;
    const text = fs.readFileSync(path.join(srcDir, file), 'utf8');
    assert.ok(!/new Error\(/.test(text), `no plain new Error( left in src/${file}`);
  }
  console.log('PASS');
} catch (err) {
  console.error('FAIL: ' + err.message);
  process.exit(1);
}
