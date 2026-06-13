'use strict';

// Semantic-version precedence sorting. See docs/registry.md for the contract
// and docs/conventions.md for the precedence rules (numeric core fields,
// pre-release lower than release, build metadata ignored for precedence).
//
// Returns the input version strings sorted ascending by SemVer precedence,
// each original string preserved verbatim (build metadata is not stripped),
// without mutating the input array.
function sortVersions(versions) {
  throw new Error('sortVersions: not implemented');
}

module.exports = { sortVersions };
