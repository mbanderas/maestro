'use strict';

// CSV line parser. See docs/rows.md for the contract and docs/conventions.md
// for the field rules (quoted fields unwrapped, embedded commas preserved,
// "" unescaped to ", no trimming).
//
// Returns an array of decoded field strings. Pure: no mutation, no I/O.
function parseCsvLine(line) {
  throw new Error('parseCsvLine: not implemented');
}

module.exports = { parseCsvLine };
