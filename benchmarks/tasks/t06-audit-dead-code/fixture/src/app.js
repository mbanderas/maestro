'use strict';

const { buildKey, toCsvRow, stripBom } = require('./legacy');

function exportRow(prefix, id, fields) {
  return toCsvRow([buildKey(prefix, id), ...fields]);
}

function readConfigText(raw) {
  return stripBom(raw);
}

module.exports = { exportRow, readConfigText };
