'use strict';

const { loadRows } = require('../core/rows.js');
const { parseCsvLine } = require('../core/csv.js');

// Renders each row as its pipe-joined fields. While the parser is being
// implemented it tolerates lines it cannot yet parse by echoing the raw line,
// so the command keeps working either way.
function showRows() {
  for (const line of loadRows()) {
    let shown;
    try {
      shown = parseCsvLine(line).join(' | ');
    } catch {
      shown = line;
    }
    console.log(shown);
  }
}

module.exports = { showRows };
