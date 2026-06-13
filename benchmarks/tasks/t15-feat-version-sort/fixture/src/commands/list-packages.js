'use strict';

const { loadPackages } = require('../core/packages.js');
const { lexicalCompare } = require('../lib/strings.js');

// Human-facing listing: packages in alphabetical (lexical) order by name.
// lexicalCompare is correct for names; it is NOT a version precedence
// comparator (see docs/conventions.md).
function listPackages() {
  const pkgs = loadPackages().slice().sort((a, b) => lexicalCompare(a.name, b.name));
  for (const p of pkgs) {
    console.log(`${p.name}\t${p.version}`);
  }
}

module.exports = { listPackages };
