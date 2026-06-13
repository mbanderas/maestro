'use strict';

const fs = require('node:fs');
const path = require('node:path');

// Loads the sample CSV as an array of raw lines (header included, blank lines
// dropped). Field decoding is the parser's job (src/core/csv.js).

function loadRows() {
  const file = path.join(__dirname, '..', '..', 'data', 'rows.csv');
  return fs.readFileSync(file, 'utf8').split(/\r?\n/).filter((l) => l.length > 0);
}

module.exports = { loadRows };
