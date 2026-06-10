'use strict';

const fs = require('node:fs');
const path = require('node:path');
const config = require('../config.js');

const file = path.join(__dirname, '..', '..', config.dataDir, 'comments.json');

function allComments() {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function saveComments(records) {
  fs.writeFileSync(file, JSON.stringify(records, null, 2) + '\n');
}

module.exports = { allComments, saveComments };
