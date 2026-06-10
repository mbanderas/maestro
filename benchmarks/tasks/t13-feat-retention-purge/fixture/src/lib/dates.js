'use strict';

// Whole days from isoA to isoB (positive when isoB is later).
function daysBetween(isoA, isoB) {
  const a = Date.parse(isoA);
  const b = Date.parse(isoB);
  return Math.floor((b - a) / 86400000);
}

module.exports = { daysBetween };
