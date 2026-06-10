'use strict';

const { EVENTS, emit } = require('../bus.js');
const { CONFIG_SCHEMA, validate } = require('../config.js');
const { STRINGS } = require('../strings.js');

// Extend CONFIG_SCHEMA with metrics-specific keys.
CONFIG_SCHEMA['metrics.retentionDays'] = { type: 'number', default: 30 };

const _records = [];
let _cfg = validate({});

function init(cfg) {
  _cfg = validate(cfg || {});
}

function recordMetric(name, value) {
  const entry = { name, value };
  _records.push(entry);
  emit(EVENTS.METRIC_RECORDED, entry);
  return STRINGS.METRIC_RECORDED
    .replace('{name}', name)
    .replace('{value}', value);
}

function getRecords() {
  return _records.slice();
}

module.exports = { init, recordMetric, getRecords };
