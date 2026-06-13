'use strict';

// Duration parser. See docs/timeouts.md for the contract and
// docs/conventions.md for the format rules (compound segments sum, ms is
// tokenized before m, a bare integer is milliseconds, the whole string must
// be consumed).
//
// Returns a non-negative integer number of milliseconds; throws on an
// unparseable input. Pure: no mutation, no I/O.
function parseDuration(str) {
  throw new Error('parseDuration: not implemented');
}

module.exports = { parseDuration };
