'use strict';

// Integer cents -> display string. Money is integer cents everywhere in
// calculations (docs/conventions.md); this is the only dollar conversion.
function formatCents(cents) {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100);
  const rem = String(abs % 100).padStart(2, '0');
  return `${sign}$${dollars}.${rem}`;
}

module.exports = { formatCents };
