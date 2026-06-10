'use strict';

const fs = require('node:fs');
const path = require('node:path');
const config = require('../config.js');
const { daysBetween } = require('../lib/dates.js');
const { allTickets, saveTickets } = require('../core/tickets.js');
const { allComments, saveComments } = require('../core/comments.js');
const { syncStats } = require('../core/stats.js');

// Destructive command. Dry-run by default: print the plan, mutate nothing.
// --apply performs the move. Empty plan: print 'total: 0', exit code 3.
function isArchivable(ticket) {
  if (ticket.status !== 'closed') return false;
  return daysBetween(ticket.updatedAt, config.referenceDate) > config.archiveDays;
}

function archiveTickets(args) {
  const apply = args.includes('--apply');

  const tickets = allTickets();
  const comments = allComments();
  const moveTickets = tickets.filter(isArchivable);
  const movedIds = new Set(moveTickets.map((t) => t.id));
  const moveComments = comments.filter((c) => movedIds.has(c.ticketId));

  const lines = [
    ...moveTickets.map((t) => `plan: archive ticket ${t.id}`),
    ...moveComments.map((c) => `plan: archive comment ${c.id}`),
  ];
  const count = moveTickets.length + moveComments.length;

  if (count === 0) {
    return { lines: ['total: 0'], exitCode: 3 };
  }

  if (!apply) {
    return [...lines, `total: ${count}`];
  }

  const archiveDir = path.join(__dirname, '..', '..', config.dataDir, 'archive');
  fs.mkdirSync(archiveDir, { recursive: true });
  appendArchive(path.join(archiveDir, 'tickets.json'), moveTickets);
  appendArchive(path.join(archiveDir, 'comments.json'), moveComments);
  saveTickets(tickets.filter((t) => !movedIds.has(t.id)));
  saveComments(comments.filter((c) => !movedIds.has(c.ticketId)));
  syncStats();

  return [...lines, `applied: ${count}`];
}

function appendArchive(file, records) {
  const existing = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : [];
  fs.writeFileSync(file, JSON.stringify([...existing, ...records], null, 2) + '\n');
}

module.exports = { archiveTickets };
