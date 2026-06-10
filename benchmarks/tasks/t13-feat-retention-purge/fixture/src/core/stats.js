'use strict';

const fs = require('node:fs');
const path = require('node:path');
const config = require('../config.js');

const dataDir = path.join(__dirname, '..', '..', config.dataDir);
const file = path.join(dataDir, 'stats.json');

// data/stats.json caches record counts for the live dataset. Any command
// that changes the number of records in data/*.json must call syncStats()
// after saving, so the cached counts always match the data files.
function syncStats() {
  const count = (name) =>
    JSON.parse(fs.readFileSync(path.join(dataDir, name + '.json'), 'utf8')).length;
  const stats = {
    customers: count('customers'),
    tickets: count('tickets'),
    comments: count('comments'),
  };
  fs.writeFileSync(file, JSON.stringify(stats, null, 2) + '\n');
  return stats;
}

module.exports = { syncStats };
