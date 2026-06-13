'use strict';

const { listPackages } = require('./list-packages.js');
const { help } = require('./help.js');

// Command name -> handler. Keep keys alphabetical.
const COMMANDS = {
  help: help,
  'list-packages': listPackages,
};

module.exports = { COMMANDS };
