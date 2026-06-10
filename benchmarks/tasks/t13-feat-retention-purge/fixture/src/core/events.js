'use strict';

const fs = require('node:fs');
const path = require('node:path');
const config = require('../config.js');

const file = path.join(__dirname, '..', '..', config.dataDir, 'events.log');

// data/events.log is the append-only audit trail. Every destructive command
// appends one line per applied run: '<action>: <n> records'.
function logEvent(action, count) {
  fs.appendFileSync(file, `${action}: ${count} records\n`);
}

module.exports = { logEvent };
