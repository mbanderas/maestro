'use strict';

const fs = require('node:fs');
const path = require('node:path');
const config = require('../config.js');

const file = path.join(__dirname, '..', '..', config.dataDir, 'tickets.json');

function allTickets() {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function saveTickets(records) {
  fs.writeFileSync(file, JSON.stringify(records, null, 2) + '\n');
}

module.exports = { allTickets, saveTickets };
