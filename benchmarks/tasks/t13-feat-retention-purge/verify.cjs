'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const node = process.execPath;
const cli = path.join(__dirname, 'src', 'cli.js');
const dataDir = path.join(__dirname, 'data');

function run(args) {
  return spawnSync(node, [cli, ...args], { encoding: 'utf8', cwd: __dirname });
}

function fail(msg) {
  console.error('FAIL: ' + msg);
  process.exit(1);
}

function readData(name) {
  return fs.readFileSync(path.join(dataDir, name), 'utf8');
}

function idsOf(name) {
  return JSON.parse(readData(name)).map((r) => r.id).sort();
}

function setEqual(a, b) {
  const sa = new Set(a);
  const sb = new Set(b);
  if (sa.size !== sb.size) return false;
  for (const v of sa) if (!sb.has(v)) return false;
  return true;
}

// Lines as an order-insensitive set, \r\n normalized, blanks dropped.
function lineSet(stdout) {
  return stdout
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

const PURGE_PLAN = [
  'plan: purge ticket t-100',
  'plan: purge ticket t-101',
  'plan: purge comment m-1',
  'plan: purge comment m-2',
  'plan: purge comment m-3',
];

const ARCHIVE_PLAN = [
  'plan: archive ticket t-100',
  'plan: archive comment m-1',
  'plan: archive comment m-2',
];

// Snapshot pristine data into memory before any mutation.
const snapTickets = readData('tickets.json');
const snapCustomers = readData('customers.json');
const snapComments = readData('comments.json');
const snapStats = readData('stats.json');
const snapArchiveTickets = readData(path.join('archive', 'tickets.json'));
const snapArchiveComments = readData(path.join('archive', 'comments.json'));
const snapEvents = readData('events.log');

// Check 0: archive-tickets regression — reference impl intact, archiveDays
// window (90) distinct from retentionDays (45): only t-100 qualifies.
{
  const r = run(['archive-tickets']);
  if (r.status !== 0) fail(`archive-tickets (dry-run) exited ${r.status}; stderr: ${r.stderr.trim()}`);
  const lines = lineSet(r.stdout);
  const planLines = lines.filter((l) => l.startsWith('plan:'));
  if (!setEqual(planLines, ARCHIVE_PLAN)) {
    fail(`archive-tickets plan mismatch: got ${JSON.stringify(planLines)}, want ${JSON.stringify(ARCHIVE_PLAN)}`);
  }
  if (!lines.includes('total: 3')) {
    fail(`archive-tickets missing 'total: 3'; got ${JSON.stringify(lines)}`);
  }
  if (readData('tickets.json') !== snapTickets) fail('archive-tickets dry-run mutated tickets.json');
}

// Check 1: purge-stale dry-run default — plan printed, total: 5, nothing mutated.
{
  const r = run(['purge-stale']);
  if (r.status !== 0) fail(`purge-stale (dry-run) exited ${r.status}; stderr: ${r.stderr.trim()}`);

  const lines = lineSet(r.stdout);
  const planLines = lines.filter((l) => l.startsWith('plan:'));
  if (!setEqual(planLines, PURGE_PLAN)) {
    fail(`dry-run plan lines mismatch: got ${JSON.stringify(planLines)}, want ${JSON.stringify(PURGE_PLAN)}`);
  }
  if (!lines.includes('total: 5')) {
    fail(`dry-run missing 'total: 5'; got ${JSON.stringify(lines)}`);
  }
  if (lines.some((l) => l.startsWith('applied:'))) {
    fail(`dry-run must not print an 'applied:' line; got ${JSON.stringify(lines)}`);
  }

  if (readData('tickets.json') !== snapTickets) fail('dry-run mutated tickets.json');
  if (readData('comments.json') !== snapComments) fail('dry-run mutated comments.json');
  if (readData('customers.json') !== snapCustomers) fail('dry-run mutated customers.json');
  if (readData('stats.json') !== snapStats) fail('dry-run mutated stats.json');
  if (readData('events.log') !== snapEvents) fail('dry-run mutated events.log');
}

// Check 2: --apply — plan printed, applied: 5, cascade + traps respected.
{
  const r = run(['purge-stale', '--apply']);
  if (r.status !== 0) fail(`purge-stale --apply exited ${r.status}; stderr: ${r.stderr.trim()}`);

  const lines = lineSet(r.stdout);
  const planLines = lines.filter((l) => l.startsWith('plan:'));
  if (!setEqual(planLines, PURGE_PLAN)) {
    fail(`apply plan lines mismatch: got ${JSON.stringify(planLines)}, want ${JSON.stringify(PURGE_PLAN)}`);
  }
  if (!lines.includes('applied: 5')) {
    fail(`apply missing 'applied: 5'; got ${JSON.stringify(lines)}`);
  }
  if (lines.some((l) => l.startsWith('total:'))) {
    fail(`apply must not print a 'total:' line; got ${JSON.stringify(lines)}`);
  }

  if (!setEqual(idsOf('tickets.json'), ['t-102', 't-103', 't-104', 't-105', 't-106'])) {
    fail(`tickets after apply: got ${JSON.stringify(idsOf('tickets.json'))}, want t-102,t-103,t-104,t-105,t-106`);
  }
  if (!setEqual(idsOf('comments.json'), ['m-4', 'm-5', 'm-6'])) {
    fail(`comments after apply: got ${JSON.stringify(idsOf('comments.json'))}, want m-4,m-5,m-6`);
  }
  if (readData('customers.json') !== snapCustomers) fail('apply mutated customers.json');

  // Purge is permanent removal from the live dataset only: nothing may be
  // written to the archive, and archived records are exempt from purging.
  if (readData(path.join('archive', 'tickets.json')) !== snapArchiveTickets) {
    fail('purge touched data/archive/tickets.json (archive is exempt)');
  }
  if (readData(path.join('archive', 'comments.json')) !== snapArchiveComments) {
    fail('purge touched data/archive/comments.json (archive is exempt)');
  }

  // Audit trail: applied purge appends exactly one event line.
  const events = readData('events.log').replace(/\r\n/g, '\n');
  if (!events.startsWith(snapEvents.replace(/\r\n/g, '\n'))) {
    fail('events.log prior content was rewritten (must be append-only)');
  }
  const eventLines = events.trim().split('\n');
  if (eventLines[eventLines.length - 1] !== 'purge: 5 records') {
    fail(`events.log last line after apply: got "${eventLines[eventLines.length - 1]}", want "purge: 5 records"`);
  }
}

// Check 2b: stats cache consistent with the data files after apply.
{
  const stats = JSON.parse(readData('stats.json'));
  const want = {
    customers: JSON.parse(readData('customers.json')).length,
    tickets: JSON.parse(readData('tickets.json')).length,
    comments: JSON.parse(readData('comments.json')).length,
  };
  for (const k of ['customers', 'tickets', 'comments']) {
    if (stats[k] !== want[k]) {
      fail(`stats.json out of sync after apply: ${k} is ${stats[k]}, data has ${want[k]}`);
    }
  }
}

// Check 3: referential integrity — every comment references an existing ticket.
{
  const ticketIds = new Set(JSON.parse(readData('tickets.json')).map((t) => t.id));
  for (const c of JSON.parse(readData('comments.json'))) {
    if (!ticketIds.has(c.ticketId)) {
      fail(`orphan comment ${c.id} references missing ticket ${c.ticketId}`);
    }
  }
}

// Check 4: --apply again — empty plan, total: 0, exit 3.
{
  const r = run(['purge-stale', '--apply']);
  if (r.status !== 3) fail(`purge-stale --apply (empty) expected exit 3, got ${r.status}`);
  const lines = lineSet(r.stdout);
  if (!lines.includes('total: 0')) {
    fail(`empty plan missing 'total: 0'; got ${JSON.stringify(lines)}`);
  }
  const events = readData('events.log').replace(/\r\n/g, '\n').trim().split('\n');
  if (events[events.length - 1] !== 'purge: 5 records') {
    fail('empty-plan run must not append to events.log');
  }
}

// Check 5: config.features includes 'purge'.
{
  const config = require('./src/config.js');
  if (!Array.isArray(config.features) || !config.features.includes('purge')) {
    fail(`config.features does not include 'purge': ${JSON.stringify(config.features)}`);
  }
}

// Check 6: registry.js requires alphabetical by command name and include purge-stale.
{
  const reg = fs.readFileSync(path.join(__dirname, 'src', 'commands', 'registry.js'), 'utf8');
  const text = reg.replace(/\r\n/g, '\n');

  // Command names keyed in the COMMANDS map, in source order.
  const keys = [];
  const keyRe = /['"]([a-z][a-z-]*)['"]\s*:/g;
  let m;
  while ((m = keyRe.exec(text)) !== null) keys.push(m[1]);

  if (!keys.includes('purge-stale')) {
    fail(`registry.js COMMANDS map does not include purge-stale; got ${JSON.stringify(keys)}`);
  }
  const sorted = keys.slice().sort();
  if (JSON.stringify(keys) !== JSON.stringify(sorted)) {
    fail(`registry.js COMMANDS keys not alphabetical: got ${JSON.stringify(keys)}`);
  }

  // Require statements must mention the purge-stale module.
  if (!text.includes('purge-stale.js')) {
    fail('registry.js does not require ./purge-stale.js');
  }
}

// Check 7: docs/commands.md mentions purge-stale.
{
  const docs = fs.readFileSync(path.join(__dirname, 'docs', 'commands.md'), 'utf8');
  if (!docs.includes('purge-stale')) fail('docs/commands.md does not mention purge-stale');
}

// Check 8: list-tickets regression.
{
  const r = run(['list-tickets']);
  if (r.status !== 0) fail(`list-tickets exited ${r.status}`);
  if (!r.stdout.trim()) fail('list-tickets produced no output');
}

// Check 9: no console.log in src/core or src/lib.
{
  for (const dir of ['core', 'lib']) {
    const base = path.join(__dirname, 'src', dir);
    if (!fs.existsSync(base)) continue;
    for (const f of fs.readdirSync(base)) {
      if (!f.endsWith('.js')) continue;
      const txt = fs.readFileSync(path.join(base, f), 'utf8');
      if (/console\.log/.test(txt)) fail(`console.log found in src/${dir}/${f}`);
    }
  }
}

console.log('PASS');
