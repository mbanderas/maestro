'use strict';

function parseIso(text) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(text))) {
    throw new Error('BAD_DATE: not an ISO date');
  }
  const [y, m, d] = text.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

module.exports = { parseIso };
