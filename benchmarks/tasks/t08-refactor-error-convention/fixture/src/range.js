'use strict';

function clamp(value, min, max) {
  if (min > max) {
    throw new Error('BAD_RANGE: min above max');
  }
  return Math.min(Math.max(value, min), max);
}

module.exports = { clamp };
