'use strict';

const CONFIG_SCHEMA = {
  'alerts.maxHistory': { type: 'number', default: 100 },
  'metrics.retentionDays': { type: 'number', default: 30 },
  'users.maxUsers': { type: 'number', default: 500 },
};

function validate(cfg) {
  const result = {};
  for (const key of Object.keys(CONFIG_SCHEMA)) {
    result[key] = CONFIG_SCHEMA[key].default;
  }
  for (const key of Object.keys(cfg)) {
    if (!CONFIG_SCHEMA[key]) {
      throw new Error('unknown config key: ' + key);
    }
    result[key] = cfg[key];
  }
  return result;
}

module.exports = { CONFIG_SCHEMA, validate };
