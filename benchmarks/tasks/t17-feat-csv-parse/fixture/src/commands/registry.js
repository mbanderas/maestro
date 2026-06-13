'use strict';

const { showRows } = require('./show-rows.js');
const { help } = require('./help.js');

// Command name -> handler. Keep keys alphabetical.
const COMMANDS = {
  help: help,
  'show-rows': showRows,
};

module.exports = { COMMANDS };
