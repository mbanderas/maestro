'use strict';

const { EVENTS, emit } = require('../bus.js');
const { CONFIG_SCHEMA, validate } = require('../config.js');
const { STRINGS } = require('../strings.js');

// Extend CONFIG_SCHEMA with users-specific keys.
CONFIG_SCHEMA['users.maxUsers'] = { type: 'number', default: 500 };

const _users = [];
let _cfg = validate({});

function init(cfg) {
  _cfg = validate(cfg || {});
}

function addUser(username) {
  if (_users.length >= _cfg['users.maxUsers']) {
    throw new Error('user limit reached');
  }
  const entry = { username };
  _users.push(entry);
  emit(EVENTS.USER_ADDED, { username });
  return STRINGS.USER_ADDED.replace('{username}', username);
}

function getUsers() {
  return _users.slice();
}

module.exports = { init, addUser, getUsers };
