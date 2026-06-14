#!/usr/bin/env node
// Maestro Settings — config unit tests. Zero deps, standalone.
// Uses temp XDG_CONFIG_HOME + CLAUDE_CONFIG_DIR so it never touches real
// config. Run: node settings/config.test.cjs

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

// Temp dirs MUST be set before requiring the modules so configDir() and
// claudeDir() pick them up.
const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'settings-test-'));
const xdg = path.join(tmpBase, 'xdg');
const claude = path.join(tmpBase, 'claude');
fs.mkdirSync(xdg, { recursive: true });
fs.mkdirSync(claude, { recursive: true });
process.env.XDG_CONFIG_HOME = xdg;
process.env.CLAUDE_CONFIG_DIR = claude;
delete process.env.MAESTRO_TERSE_LEVEL;

const settings = require('./config.cjs');
const frontier = require('../frontier/config.cjs');

let failures = 0;
function check(name, cond) {
  if (!cond) { console.error('FAIL: ' + name); failures++; }
}

function main() {
  // ---- terse ----
  // (a) no config -> off / default
  {
    const t = settings.readTerse();
    check('terse no-config -> off', t.level === 'off' && t.source === 'default');
  }

  // (b) setTerse('ultra') writes config.json + live flag; read reflects it
  {
    const r = settings.setTerse('ultra');
    check('setTerse ultra ok', r.ok === true);
    const t = settings.readTerse();
    check('terse reads ultra from config', t.level === 'ultra' && t.source === 'config');
    const flag = fs.readFileSync(settings.terseFlagPath(), 'utf8').trim();
    check('terse live flag mirrors ultra', flag === 'ultra');
    const cfg = JSON.parse(fs.readFileSync(settings.configJsonPath(), 'utf8'));
    check('config.json terseLevel = ultra', cfg.terseLevel === 'ultra');
  }

  // (c) merge preserves other keys
  {
    const p = settings.configJsonPath();
    const cfg = JSON.parse(fs.readFileSync(p, 'utf8'));
    cfg.someOtherKey = 'keep-me';
    fs.writeFileSync(p, JSON.stringify(cfg));
    settings.setTerse('lite');
    const after = JSON.parse(fs.readFileSync(p, 'utf8'));
    check('merge preserves other keys', after.someOtherKey === 'keep-me');
    check('merge updates terseLevel', after.terseLevel === 'lite');
  }

  // (d) setTerse('off') removes the live flag
  {
    settings.setTerse('off');
    check('terse off removes flag', !fs.existsSync(settings.terseFlagPath()));
    const t = settings.readTerse();
    check('terse off reads off', t.level === 'off');
  }

  // (e) invalid terse rejected
  {
    const r = settings.setTerse('loud');
    check('invalid terse rejected', r.ok === false && /must be/.test(r.error));
  }

  // (f) env override is reported and warned
  {
    process.env.MAESTRO_TERSE_LEVEL = 'full';
    const t = settings.readTerse();
    check('env override source=env', t.level === 'full' && t.source === 'env' && t.envOverride === 'full');
    const r = settings.setTerse('lite');
    check('setTerse warns under env override', r.ok === true && /MAESTRO_TERSE_LEVEL/.test(r.warning || ''));
    delete process.env.MAESTRO_TERSE_LEVEL;
  }

  // ---- frontier (no desync: read back via frontier/config.cjs directly) ----
  // (g) fusion preset
  {
    const r = settings.setFrontier('fusion:opus-gpt');
    check('setFrontier fusion ok', r.ok === true);
    const direct = frontier.loadState();
    check('frontier no-desync mode', direct.mode === 'fusion');
    check('frontier no-desync preset', direct.preset === 'opus-gpt');
  }

  // (h) single model
  {
    settings.setFrontier('single:opus');
    const direct = frontier.loadState();
    check('frontier single via existing reader', direct.mode === 'single' && direct.model === 'opus');
  }

  // (i) judge/synth overrides on fusion
  {
    settings.setFrontier('fusion:opus-gpt', { judge: 'opus', synth: 'gpt-5.5' });
    const direct = frontier.loadState();
    check('frontier judge override', direct.judgeModel === 'opus');
    check('frontier synth override', direct.synthModel === 'gpt-5.5');
  }

  // (j) unknown model / preset rejected, state unchanged
  {
    settings.setFrontier('off');
    const bad = settings.setFrontier('single:nope');
    check('frontier unknown model rejected', bad.ok === false);
    const badP = settings.setFrontier('fusion:nope');
    check('frontier unknown preset rejected', badP.ok === false);
    check('frontier unchanged after reject', frontier.loadState().mode === 'off');
  }

  // ---- context-bar ----
  // (k) fallback when no settings.json -> claudeDir/statusline, unconfirmed
  {
    const r = settings.resolveStatuslineDir();
    check('context-bar fallback dir', r.dir === path.join(claude, 'statusline'));
    check('context-bar fallback unconfirmed', r.scriptOk === false && r.resolved === false);
  }

  // (l) resolve from settings.json statusLine.command -> script's own dir
  {
    const slDir = path.join(claude, 'statusline');
    fs.mkdirSync(slDir, { recursive: true });
    const scriptPath = path.join(slDir, 'context-bar.sh');
    const settingsJson = { statusLine: { type: 'command', command: 'bash ' + scriptPath } };
    fs.writeFileSync(path.join(claude, 'settings.json'), JSON.stringify(settingsJson));
    const r = settings.resolveStatuslineDir();
    check('context-bar resolves script dir', r.dir === slDir);
    check('context-bar confirms script', r.scriptOk === true && r.resolved === true);
  }

  // (m) toggle creates/removes the flag at the resolved dir
  {
    const off = settings.setContextBar(false);
    check('context-bar disable ok', off.ok === true);
    const cb1 = settings.readContextBar();
    check('context-bar reads disabled', cb1.enabled === false);
    check('flag present at script dir', fs.existsSync(cb1.flagPath));
    settings.setContextBar(true);
    const cb2 = settings.readContextBar();
    check('context-bar reads enabled', cb2.enabled === true);
    check('flag removed', !fs.existsSync(cb2.flagPath));
  }

  // (n) setKey dispatch + bad key
  {
    check('setKey terse', settings.setKey('terse', 'off').ok === true);
    check('setKey context-bar bad value', settings.setKey('context-bar', 'maybe').ok === false);
    check('setKey unknown key', settings.setKey('nope', 'x').ok === false);
  }

  // (o) readAll aggregates all three
  {
    const all = settings.readAll();
    check('readAll has terse', !!all.terse && typeof all.terse.level === 'string');
    check('readAll has frontier', !!all.frontier && typeof all.frontier.mode === 'string');
    check('readAll has contextBar', !!all.contextBar && typeof all.contextBar.enabled === 'boolean');
  }

  // ---- cleanup ----
  try { fs.rmSync(tmpBase, { recursive: true, force: true }); } catch {}

  if (failures > 0) {
    console.error('\n' + failures + ' test(s) failed.');
    process.exit(1);
  }
  console.log('settings/config.test.cjs: all tests passed.');
}

main();
