'use strict';

function titleCase(text) {
  return text.replace(/\b\w/g, (c) => c.toUpperCase());
}

module.exports = { titleCase };
