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

const { DEFAULTS, loadState, saveState, resolvePanel, validatePreset,
  resolveJudgeModel, resolveSynthModel } = require('./config.cjs');

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

  // (h) gpt-duo preset resolves to two GPT-5.5 panel members
  {
    const models = resolvePanel({ preset: 'gpt-duo' }, DEFAULTS);
    check('gpt-duo panel', JSON.stringify(models) === JSON.stringify(['gpt-5.5', 'gpt-5.5']));
  }

  // (i) gpt-duo judge+synth resolve to gpt-5.5 (Codex-only fusion)
  {
    check('gpt-duo judge -> gpt-5.5', resolveJudgeModel({ preset: 'gpt-duo' }, DEFAULTS) === 'gpt-5.5');
    check('gpt-duo synth -> gpt-5.5', resolveSynthModel({ preset: 'gpt-duo' }, DEFAULTS) === 'gpt-5.5');
  }

  // (j) presets without a stage override fall back to the global Opus default
  {
    check('opus-gpt judge -> opus (default)', resolveJudgeModel({ preset: 'opus-gpt' }, DEFAULTS) === 'opus');
    check('opus-gpt synth -> opus (default)', resolveSynthModel({ preset: 'opus-gpt' }, DEFAULTS) === 'opus');
  }

  // (k) explicit --judge/--synth override beats preset + default
  {
    const st = { preset: 'gpt-duo', judgeModel: 'opus', synthModel: 'gemini' };
    check('explicit judge override', resolveJudgeModel(st, DEFAULTS) === 'opus');
    check('explicit synth override', resolveSynthModel(st, DEFAULTS) === 'gemini');
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
