'use strict';

const assert = require('node:assert');

const api = require('./src/index.js');

try {
  assert.strictEqual(typeof api.slugify, 'function', 'slugify exported from src/index.js');
  assert.strictEqual(api.slugify('  Hello,  World!  '), 'hello-world', 'example case');
  assert.strictEqual(api.slugify('Already-Slugged'), 'already-slugged', 'preserves hyphens');
  assert.strictEqual(api.slugify('A  B   C'), 'a-b-c', 'whitespace runs');
  assert.strictEqual(api.slugify('--x--'), 'x', 'trims hyphens');
  assert.strictEqual(api.slugify('100% Pure'), '100-pure', 'strips punctuation');
  assert.strictEqual(typeof api.titleCase, 'function', 'titleCase still exported');
  assert.strictEqual(api.titleCase('ab cd'), 'Ab Cd', 'titleCase untouched');
  console.log('PASS');
} catch (err) {
  console.error('FAIL: ' + err.message);
  process.exit(1);
}
