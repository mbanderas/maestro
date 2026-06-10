'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const base = __dirname;

function run(args) {
  const out = execFileSync(process.execPath, [path.join(base, 'bin', 'console.js'), ...args], {
    encoding: 'utf8',
  });
  return out.replace(/\r\n/g, '\n').trim();
}

try {
  // ── 1. notifications module: send/list/clear + maxQueue drop-oldest ─────────

  const notifPath = path.join(base, 'src', 'modules', 'notifications.js');
  assert.ok(fs.existsSync(notifPath), 'src/modules/notifications.js exists');

  const notif = require(notifPath);
  assert.strictEqual(typeof notif.send, 'function', 'notifications.send is a function');
  assert.strictEqual(typeof notif.list, 'function', 'notifications.list is a function');
  assert.strictEqual(typeof notif.clear, 'function', 'notifications.clear is a function');

  // Basic send/list/clear behaviour
  notif.send('alice', 'hello');
  notif.send('alice', 'world');
  const aliceList = notif.list('alice');
  assert.deepStrictEqual(aliceList, ['hello', 'world'], 'list returns sent messages in order');
  notif.clear('alice');
  assert.deepStrictEqual(notif.list('alice'), [], 'clear empties the queue');

  // Default maxQueue = 50: verify we can fill exactly 50 without drop
  notif.clear('bob');
  for (let i = 0; i < 50; i++) notif.send('bob', 'msg' + i);
  assert.strictEqual(notif.list('bob').length, 50, 'default maxQueue allows 50 messages');
  notif.send('bob', 'overflow');
  const bobList = notif.list('bob');
  assert.strictEqual(bobList.length, 50, 'queue stays at 50 after overflow');
  assert.strictEqual(bobList[0], 'msg1', 'oldest message dropped on overflow');
  assert.strictEqual(bobList[49], 'overflow', 'newest message present after overflow');

  // Config override: maxQueue = 2
  // Re-require via a fresh module using init if available, otherwise test via config path
  // Notifications module must expose init(cfg) like other modules
  assert.strictEqual(typeof notif.init, 'function', 'notifications.init is a function');
  notif.init({ 'notifications.maxQueue': 2 });
  notif.clear('carol');
  notif.send('carol', 'a');
  notif.send('carol', 'b');
  notif.send('carol', 'c');
  const carolList = notif.list('carol');
  assert.strictEqual(carolList.length, 2, 'maxQueue=2 config respected');
  assert.strictEqual(carolList[0], 'b', 'oldest dropped when maxQueue=2');
  assert.strictEqual(carolList[1], 'c', 'newest retained when maxQueue=2');
  // Restore default for subsequent tests
  notif.init({});

  // ── 2. registry: 'notifications' present, order still alphabetical ───────────

  const { REGISTRY } = require(path.join(base, 'src', 'registry.js'));
  const names = REGISTRY.map((e) => e.name);
  assert.ok(names.includes('notifications'), "registry includes 'notifications'");
  for (const entry of REGISTRY) {
    assert.strictEqual(typeof entry.name, 'string', 'registry entry has name');
    assert.strictEqual(typeof entry.init, 'function', 'registry entry has init function');
  }
  const sorted = names.slice().sort();
  assert.deepStrictEqual(names, sorted, 'registry entries are in alphabetical order');

  // ── 3. bus.js EVENTS: a NOTIFICATION_* key exists; subscribing fires payload ─

  const { EVENTS, on, emit } = require(path.join(base, 'src', 'bus.js'));
  const notifEventKey = Object.keys(EVENTS).find((k) => /^NOTIFICATION_[A-Z_]+$/.test(k));
  assert.ok(notifEventKey, 'EVENTS has a key matching NOTIFICATION_[A-Z_]+');

  let received = null;
  on(EVENTS[notifEventKey], (payload) => { received = payload; });
  notif.clear('dave');
  notif.send('dave', 'test-event');
  assert.ok(received !== null, 'event fired on send');
  assert.strictEqual(received.user, 'dave', 'event payload has user');
  assert.strictEqual(received.message, 'test-event', 'event payload has message');

  // ── 4. CONFIG_SCHEMA + validate ──────────────────────────────────────────────

  const { CONFIG_SCHEMA, validate } = require(path.join(base, 'src', 'config.js'));
  assert.ok(
    Object.prototype.hasOwnProperty.call(CONFIG_SCHEMA, 'notifications.maxQueue'),
    "CONFIG_SCHEMA has 'notifications.maxQueue'"
  );
  const nqSchema = CONFIG_SCHEMA['notifications.maxQueue'];
  assert.strictEqual(nqSchema.type, 'number', "notifications.maxQueue type is 'number'");
  assert.strictEqual(nqSchema.default, 50, 'notifications.maxQueue default is 50');

  const defaults = validate({});
  assert.strictEqual(defaults['notifications.maxQueue'], 50, "validate({}) fills notifications.maxQueue default");

  let threw = false;
  try { validate({ 'does.not.exist': 1 }); } catch (_) { threw = true; }
  assert.ok(threw, 'validate rejects unknown config keys');

  // ── 5. barrel: exports notifications API + list is alphabetized ─────────────

  const barrel = require(path.join(base, 'src', 'index.js'));
  assert.strictEqual(typeof barrel.send, 'function', "barrel exports 'send'");
  assert.strictEqual(typeof barrel.list, 'function', "barrel exports 'list'");
  assert.strictEqual(typeof barrel.clear, 'function', "barrel exports 'clear'");

  const barrelSrc = fs.readFileSync(path.join(base, 'src', 'index.js'), 'utf8');
  // Extract module names from require('./modules/<name>.js') lines, in order
  const requireMatches = [...barrelSrc.matchAll(/require\(['"]\.\/modules\/([^'"]+)\.js['"]\)/g)];
  const barrelModuleNames = requireMatches.map((m) => m[1]);
  assert.ok(barrelModuleNames.length >= 4, 'barrel requires at least 4 modules');
  const barrelSorted = barrelModuleNames.slice().sort();
  assert.deepStrictEqual(barrelModuleNames, barrelSorted, 'barrel module requires are in alphabetical order');

  // ── 6. docs/MODULES.md: notifications section, alphabetical position ─────────

  const docsPath = path.join(base, 'docs', 'MODULES.md');
  assert.ok(fs.existsSync(docsPath), 'docs/MODULES.md exists');
  const docs = fs.readFileSync(docsPath, 'utf8');

  assert.ok(/^## notifications$/m.test(docs), "docs/MODULES.md has '## notifications' section");
  assert.ok(/^Purpose:/m.test(docs), "notifications section has 'Purpose:' line");
  assert.ok(/^Config:/m.test(docs), "notifications section has 'Config:' line");
  assert.ok(/^Events:/m.test(docs), "notifications section has 'Events:' line");

  // Alphabetical section order: alerts < metrics < notifications < users
  const h2Positions = {};
  for (const mod of ['alerts', 'metrics', 'notifications', 'users']) {
    const idx = docs.indexOf('## ' + mod);
    assert.ok(idx !== -1, `docs/MODULES.md has ## ${mod} section`);
    h2Positions[mod] = idx;
  }
  assert.ok(
    h2Positions.alerts < h2Positions.metrics &&
    h2Positions.metrics < h2Positions.notifications &&
    h2Positions.notifications < h2Positions.users,
    'MODULES.md sections are in alphabetical order (alerts, metrics, notifications, users)'
  );

  // ── 7. No inline user-facing string regression: CLI notify path uses strings.js

  const consoleSrc = fs.readFileSync(path.join(base, 'bin', 'console.js'), 'utf8');
  const { STRINGS } = require(path.join(base, 'src', 'strings.js'));

  // Check that the notify command handling references a strings.js key
  const usesStringsKey = /strings\.[A-Z_]+/.test(consoleSrc) || /STRINGS\.[A-Z_]+/.test(consoleSrc);
  const hasDestructuredUsage = Object.keys(STRINGS).some((k) => {
    const re = new RegExp('\\b' + k + '\\b');
    return re.test(consoleSrc);
  });
  assert.ok(
    usesStringsKey || hasDestructuredUsage,
    'bin/console.js references a STRINGS key (not inline literals)'
  );

  // The notify-output string key must exist in STRINGS
  const notifyStringExists = Object.keys(STRINGS).some((k) => {
    // Accept any key whose value template contains 'user' or 'message' or 'notification'
    const val = STRINGS[k].toLowerCase();
    return val.includes('notif') || (val.includes('user') && val.includes('message'));
  });
  assert.ok(notifyStringExists, 'strings.js has a key for the notify output');

  // ── 8. Regression: existing alerts/metrics/users behaviours ─────────────────

  const { raiseAlert, getHistory } = require(path.join(base, 'src', 'modules', 'alerts.js'));
  const { recordMetric, getRecords } = require(path.join(base, 'src', 'modules', 'metrics.js'));
  const { addUser, getUsers } = require(path.join(base, 'src', 'modules', 'users.js'));

  raiseAlert('warn', 'disk space low');
  const history = getHistory();
  assert.ok(history.length >= 1, 'alerts: getHistory returns entries');
  assert.strictEqual(history[history.length - 1].level, 'warn', 'alerts: correct level recorded');
  assert.strictEqual(history[history.length - 1].message, 'disk space low', 'alerts: correct message recorded');

  recordMetric('cpu', 42);
  const records = getRecords();
  assert.ok(records.length >= 1, 'metrics: getRecords returns entries');
  assert.strictEqual(records[records.length - 1].name, 'cpu', 'metrics: correct name recorded');
  assert.strictEqual(records[records.length - 1].value, 42, 'metrics: correct value recorded');

  addUser('testuser');
  const users = getUsers();
  assert.ok(users.some((u) => u.username === 'testuser'), 'users: addUser stores the user');

  // CLI notify command
  const cliOut = run(['notify', 'eve', 'hello from CLI']);
  assert.ok(typeof cliOut === 'string' && cliOut.length > 0, 'CLI notify command produces output');

  console.log('PASS');
} catch (err) {
  console.error('FAIL: ' + err.message);
  process.exit(1);
}
