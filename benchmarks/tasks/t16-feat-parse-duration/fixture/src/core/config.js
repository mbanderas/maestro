'use strict';

const fs = require('node:fs');
const path = require('node:path');

// Timeout config shape: an object of { name: durationString }.

function loadTimeouts() {
  const file = path.join(__dirname, '..', '..', 'data', 'timeouts.json');
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

module.exports = { loadTimeouts };
