'use strict';

// Format a row of values as a fixed-width table line.
function tableRow(fields) {
  return fields.join('  ');
}

// Pad a string to a minimum width.
function pad(str, width) {
  return String(str).padEnd(width);
}

module.exports = { tableRow, pad };
