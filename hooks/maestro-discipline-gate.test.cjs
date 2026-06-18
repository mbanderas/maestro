#!/usr/bin/env node
// Tests for maestro-discipline-gate.cjs and its wiring into the hook pack.
// Zero dependencies. Run: node hooks/maestro-discipline-gate.test.cjs

'use strict';

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

// Isolate config before requiring the module so configDir() points at temp.
const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'discipline-gate-test-'));
const xdg = path.join(tmpBase, 'xdg');
fs.mkdirSync(xdg, { recursive: true });
process.env.XDG_CONFIG_HOME = xdg;
delete process.env.MAESTRO_DISCIPLINE;

const gate = require('./maestro-discipline-gate.cjs');
const settings = require('../settings/config.cjs');

let failures = 0;
function check(name, cond) {
  if (cond) { console.log(`  ok    ${name}`); }
  else { failures++; console.error(`  FAIL  ${name}`); }
}

console.log('maestro-discipline-gate tests');

// 1. Default (no config, no env) -> enabled (fail-safe bias).
check('default -> enabled', gate.disciplineEnabled() === true);

// 2. config.json discipline:false -> disabled; back on -> enabled.
settings.setDiscipline('off');
check('config off -> disabled', gate.disciplineEnabled() === false);
settings.setDiscipline('on');
check('config on -> enabled', gate.disciplineEnabled() === true);

// 3. env override wins over config.
settings.setDiscipline('on');
process.env.MAESTRO_DISCIPLINE = 'off';
check('env off overrides config on', gate.disciplineEnabled() === false);
process.env.MAESTRO_DISCIPLINE = 'on';
check('env on -> enabled', gate.disciplineEnabled() === true);
delete process.env.MAESTRO_DISCIPLINE;

// 4. Wiring: a real hook (gate-reminder) no-ops when discipline is off and
//    fires when on. The gate sits before the fire-once marker write, so a
//    discipline-off run must leave no marker behind.
const HOOK = path.join(__dirname, 'maestro-gate-reminder.cjs');
function runHook(payload, env) {
  return execFileSync(process.execPath, [HOOK], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
    env: { ...process.env, XDG_CONFIG_HOME: xdg, ...env },
  });
}
const sid = () => `disc-test-${process.pid}-${Math.random().toString(36).slice(2)}`;
const markers = [];
function markerFor(id) {
  return path.join(os.tmpdir(), `maestro-gate-reminder-${id.replace(/[^a-zA-Z0-9-]/g, '_')}`);
}

const sOff = sid(); markers.push(markerFor(sOff));
let out = runHook({ session_id: sOff, prompt: 'task' }, { MAESTRO_DISCIPLINE: 'off' });
check('hook silent when discipline off', out === '');
check('discipline-off leaves no marker (hook never ran)', !fs.existsSync(markerFor(sOff)));

const sOn = sid(); markers.push(markerFor(sOn));
out = runHook({ session_id: sOn, prompt: 'task' }, { MAESTRO_DISCIPLINE: 'on' });
check('hook fires when discipline on', out.includes('Maestro · frontier'));

for (const m of markers) { try { fs.rmSync(m, { force: true }); } catch {} }
try { fs.rmSync(tmpBase, { recursive: true, force: true }); } catch {}

if (failures) { console.error(`${failures} failure(s)`); process.exit(1); }
console.log('all tests passed');
