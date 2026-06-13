'use strict';

// String ordering helpers for human-facing listings.
//
// lexicalCompare / lexicalSort order strings by code unit (ASCII / lexical).
// This is correct for listing package NAMES alphabetically. It is NOT a
// version-precedence comparator: lexically "1.10.0" sorts before "1.2.0", and
// a pre-release like "1.0.0-rc.1" sorts after "1.0.0" -- both wrong for
// SemVer. Use src/core/versions.js for version precedence (see
// docs/conventions.md).

function lexicalCompare(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

function lexicalSort(items) {
  return items.slice().sort(lexicalCompare);
}

module.exports = { lexicalCompare, lexicalSort };
