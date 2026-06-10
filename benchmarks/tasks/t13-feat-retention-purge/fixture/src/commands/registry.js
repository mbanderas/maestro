'use strict';

const { addComment } = require('./add-comment.js');
const { archiveTickets } = require('./archive-tickets.js');
const { help } = require('./help.js');
const { listComments } = require('./list-comments.js');
const { listCustomers } = require('./list-customers.js');
const { listTickets } = require('./list-tickets.js');

const COMMANDS = {
  'add-comment':     addComment,
  'archive-tickets': archiveTickets,
  'help':            help,
  'list-comments':   listComments,
  'list-customers':  listCustomers,
  'list-tickets':    listTickets,
};

module.exports = { COMMANDS };
