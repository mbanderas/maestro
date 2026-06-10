'use strict';

const { AppError } = require('../lib/errors.js');

// In-session comment additions (not persisted across runs).
const added = [];

function addComment(args) {
  const [ticketId, author, ...bodyParts] = args;
  const body = bodyParts.join(' ');
  if (!ticketId || !author || !body) {
    throw new AppError('usage: add-comment <ticketId> <author> <body>', 2);
  }
  const id = `m-new-${added.length + 1}`;
  added.push({ id, ticketId, author, body });
  return [`added comment ${id}`];
}

module.exports = { addComment };
