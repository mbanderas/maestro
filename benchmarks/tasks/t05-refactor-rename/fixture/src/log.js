'use strict';

const util = require('./util');

function logEntry(message, date) {
  return `[${util.fmtDt(date)}] ${message}`;
}

module.exports = { logEntry };
