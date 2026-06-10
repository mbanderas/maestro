'use strict';

const { init: initAlerts } = require('./modules/alerts.js');
const { init: initMetrics } = require('./modules/metrics.js');
const { init: initUsers } = require('./modules/users.js');

// Registry entries are kept in alphabetical order by name.
const REGISTRY = [
  { name: 'alerts', init: initAlerts },
  { name: 'metrics', init: initMetrics },
  { name: 'users', init: initUsers },
];

module.exports = { REGISTRY };
