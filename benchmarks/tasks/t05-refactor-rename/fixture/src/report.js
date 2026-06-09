'use strict';

const { fmtDt } = require('./util');

function reportLine(name, date) {
  return `${fmtDt(date)} ${name}`;
}

module.exports = { reportLine };
