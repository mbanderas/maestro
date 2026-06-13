'use strict';

const { showTimeouts } = require('./show-timeouts.js');
const { help } = require('./help.js');

// Command name -> handler. Keep keys alphabetical.
const COMMANDS = {
  help: help,
  'show-timeouts': showTimeouts,
};

module.exports = { COMMANDS };
