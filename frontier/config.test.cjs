#!/usr/bin/env node
// Maestro Frontier — config unit tests. Zero deps, standalone.
// Uses a temp XDG_CONFIG_HOME so it never touches real config.

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

// Set temp configDir BEFORE requiring config.cjs so configDir() picks it up.
const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'frontier-test-'));
process.env.XDG_CONFIG_HOME = tmpBase;

const { DEFAULTS, loadState, saveState, resolvePanel, validatePreset } = require('./config.cjs');

let failures = 0;
function check(name, cond) {
  if (!cond) {
    console.error('FAIL: ' + name);
    failures++;
  }
}

async function main() {

  // (a) loadState() with no file -> {mode:'off'}
  {
    const s = loadState();
    check('no-file -> mode:off', s.mode === 'off');
  }

  // (b) saveState then loadState round-trips {mode:'fusion',preset:'opus-gpt'}
  {
    const state = { mode: 'fusion', preset: 'opus-gpt' };
    const saved = saveState(state);
    check('saveState returns true', saved === true);
    const loaded = loadState();
    check('round-trip mode', loaded.mode === 'fusion');
    check('round-trip preset', loaded.preset === 'opus-gpt');
  }

  // (c) corrupt JSON file -> loadState returns {mode:'off'}
  {
    const { statePath } = require('./config.cjs');
    fs.writeFileSync(statePath(), 'NOT{JSON}', 'utf8');
    const s = loadState();
    check('corrupt JSON -> mode:off', s.mode === 'off');
    // clean up so subsequent tests start fresh
    try { fs.unlinkSync(statePath()); } catch {}
  }

  // (d) resolvePanel for 'opus-gpt' -> ['opus','gpt-5.5']
  {
    const models = resolvePanel({ preset: 'opus-gpt' }, DEFAULTS);
    check('opus-gpt resolves correctly', JSON.stringify(models) === JSON.stringify(['opus', 'gpt-5.5']));
  }

  // (e) resolvePanel custom with 9 models throws
  {
    let threw = false;
    try {
      resolvePanel(
        { preset: 'custom', models: ['opus','opus','opus','opus','opus','opus','opus','opus','opus'] },
        DEFAULTS
      );
    } catch {
      threw = true;
    }
    check('custom >8 models throws', threw);
  }

  // (f) resolvePanel custom with unknown model throws
  {
    let threw = false;
    try {
      resolvePanel({ preset: 'custom', models: ['opus', 'nonexistent-model'] }, DEFAULTS);
    } catch {
      threw = true;
    }
    check('custom unknown model throws', threw);
  }

  // (g) validatePreset
  {
    check('validatePreset frontier-trio true', validatePreset('frontier-trio', DEFAULTS) === true);
    check('validatePreset bogus false', validatePreset('bogus', DEFAULTS) === false);
  }

  // cleanup
  try { fs.rmSync(tmpBase, { recursive: true, force: true }); } catch {}

  if (failures) {
    console.error(failures + ' test(s) failed.');
    process.exit(1);
  } else {
    console.log('ok');
  }
}

main().catch(err => { console.error(err); process.exit(1); });
