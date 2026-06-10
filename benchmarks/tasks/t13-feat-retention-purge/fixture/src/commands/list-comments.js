'use strict';

const { allComments } = require('../core/comments.js');

function listComments() {
  return allComments().map((m) => `${m.id}  ${m.ticketId}  ${m.author}`);
}

module.exports = { listComments };
