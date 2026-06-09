'use strict';

const assert = require('node:assert');

const { median } = require('./median.js');

try {
  assert.strictEqual(median([1, 2, 3, 4]), 2.5, 'even length');
  assert.strictEqual(median([4, 1, 3, 2]), 2.5, 'even length unsorted');
  assert.strictEqual(median([1, 2, 3]), 2, 'odd length');
  assert.strictEqual(median([5]), 5, 'single element');
  assert.throws(() => median([]), /empty/, 'empty input throws');
  console.log('PASS');
} catch (err) {
  console.error('FAIL: ' + err.message);
  process.exit(1);
}
