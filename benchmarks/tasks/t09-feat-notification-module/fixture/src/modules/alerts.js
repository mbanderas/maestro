'use strict';

const { EVENTS, emit } = require('../bus.js');
const { CONFIG_SCHEMA, validate } = require('../config.js');
const { STRINGS } = require('../strings.js');

// Extend CONFIG_SCHEMA with alerts-specific keys.
CONFIG_SCHEMA['alerts.maxHistory'] = { type: 'number', default: 100 };

const _history = [];
let _cfg = validate({});

function init(cfg) {
  _cfg = validate(cfg || {});
}

function raiseAlert(level, message) {
  const entry = { level, message };
  _history.push(entry);
  if (_history.length > _cfg['alerts.maxHistory']) {
    _history.shift();
  }
  emit(EVENTS.ALERT_RAISED, entry);
  return STRINGS.ALERT_RAISED
    .replace('{level}', level)
    .replace('{message}', message);
}

function getHistory() {
  return _history.slice();
}

module.exports = { init, raiseAlert, getHistory };
