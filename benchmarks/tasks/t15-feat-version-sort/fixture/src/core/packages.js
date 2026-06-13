'use strict';

const fs = require('node:fs');
const path = require('node:path');

// Package record shape:
//   { name: string, version: string (SemVer) }

function loadPackages() {
  const file = path.join(__dirname, '..', '..', 'data', 'packages.json');
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

module.exports = { loadPackages };
