'use strict';

function sumRange(a, b) {
  let total = 0;
  for (let i = a; i < b; i++) total += i;
  return total;
}

function mean(values) {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

module.exports = { sumRange, mean };
