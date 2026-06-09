'use strict';

const assert = require('node:assert');

const { sumRange, mean } = require('./stats.js');

try {
  assert.strictEqual(sumRange(1, 5), 15, 'sumRange(1,5)');
  assert.strictEqual(sumRange(3, 3), 3, 'sumRange(3,3)');
  assert.strictEqual(sumRange(-2, 2), 0, 'sumRange(-2,2)');
  assert.strictEqual(sumRange(0, 10), 55, 'sumRange(0,10)');
  assert.strictEqual(mean([2, 4]), 3, 'mean untouched');
  console.log('PASS');
} catch (err) {
  console.error('FAIL: ' + err.message);
  process.exit(1);
}
