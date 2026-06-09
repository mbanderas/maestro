'use strict';

function normalizeId(id) {
  return String(id).trim().toLowerCase();
}

function buildKey(prefix, id) {
  return `${prefix}:${normalizeId(id)}`;
}

function legacyEscape(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;');
}

function toCsvRow(values) {
  return values.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',');
}

function padCell(text, width) {
  return String(text).padEnd(width, ' ');
}

function stripBom(text) {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

module.exports = { normalizeId, buildKey, legacyEscape, toCsvRow, padCell, stripBom, deepClone };
