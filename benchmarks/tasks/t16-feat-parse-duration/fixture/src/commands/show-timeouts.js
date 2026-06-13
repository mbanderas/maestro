'use strict';

const { loadTimeouts } = require('../core/config.js');
const { parseDuration } = require('../core/duration.js');

// Displays each configured timeout as normalized milliseconds. While the
// parser is being implemented it tolerates values it cannot yet parse by
// echoing the raw value, so the command keeps working either way.
function showTimeouts() {
  const cfg = loadTimeouts();
  for (const [name, value] of Object.entries(cfg)) {
    let shown;
    try {
      shown = `${parseDuration(value)}ms`;
    } catch {
      shown = value;
    }
    console.log(`${name}\t${shown}`);
  }
}

module.exports = { showTimeouts };
