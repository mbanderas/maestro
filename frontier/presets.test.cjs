#!/usr/bin/env node
// Maestro Frontier — saved user presets unit tests. Zero deps, standalone.
// Uses a temp XDG_CONFIG_HOME so it never touches real config.

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

// Set temp configDir BEFORE requiring config.cjs so configDir() picks it up.
const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'frontier-presets-test-'));
process.env.XDG_CONFIG_HOME = tmpBase;

const { DEFAULTS, resolvePanel, resolveJudgeModel, resolveSynthModel,
  validatePreset } = require('./config.cjs');
const { userPresetsPath, validateUserPresetName, loadUserPresets,
  saveUserPreset, deleteUserPreset, withUserPresets } = require('./presets.cjs');

let failures = 0;
function check(name, cond) {
  if (!cond) {
    console.error('FAIL: ' + name);
    failures++;
  }
}

const SCOPE = 'presets-test';

// (a) empty state: no file -> {}, withUserPresets returns cfg identity
{
  check('(a) no file -> empty map', Object.keys(loadUserPresets(SCOPE)).length === 0);
  check('(a) no file -> cfg identity', withUserPresets(DEFAULTS, SCOPE) === DEFAULTS);
}

// (b) save + round-trip + merged resolution
{
  const s1 = saveUserPreset('my-duo', { models: ['kimi', 'gpt-5.5'], judge: 'deepseek' }, SCOPE);
  check('(b) save ok', s1.ok === true);
  check('(b) save reports path', typeof s1.path === 'string' && s1.path.includes('frontier-presets.' + SCOPE));
  const loaded = loadUserPresets(SCOPE);
  check('(b) models round-trip',
    JSON.stringify(loaded['my-duo'] && loaded['my-duo'].models) === JSON.stringify(['kimi', 'gpt-5.5']));
  check('(b) judge round-trips', loaded['my-duo'] && loaded['my-duo'].judge === 'deepseek');
  check('(b) synth absent when unset', loaded['my-duo'] && loaded['my-duo'].synth === undefined);

  const merged = withUserPresets(DEFAULTS, SCOPE);
  check('(b) resolvePanel resolves saved preset',
    JSON.stringify(resolvePanel({ preset: 'my-duo' }, merged)) === JSON.stringify(['kimi', 'gpt-5.5']));
  check('(b) saved judge resolves', resolveJudgeModel({ preset: 'my-duo' }, merged) === 'deepseek');
  check('(b) unset synth falls to global default', resolveSynthModel({ preset: 'my-duo' }, merged) === 'opus');
  check('(b) validatePreset accepts saved preset on merged cfg', validatePreset('my-duo', merged) === true);
  check('(b) validatePreset rejects saved preset on plain DEFAULTS', validatePreset('my-duo', DEFAULTS) === false);
  check('(b) explicit --judge still beats saved stage',
    resolveJudgeModel({ preset: 'my-duo', judgeModel: 'gemini' }, merged) === 'gemini');
}

// (c) built-ins always win: refused on save, dropped on load, merge order
{
  check('(c) built-in name refused', saveUserPreset('gpt-duo', { models: ['kimi'] }, SCOPE).ok === false);
  const err = saveUserPreset('budget-trio', { models: ['kimi'] }, SCOPE);
  check('(c) new built-in name refused too', err.ok === false && /built-in/.test(err.error));
  check('(c) custom refused', saveUserPreset('custom', { models: ['kimi'] }, SCOPE).ok === false);

  // Hand-written shadowing/invalid rows are dropped on load; a slipped-in
  // shadow still loses to the built-in by merge order.
  fs.writeFileSync(userPresetsPath(SCOPE), JSON.stringify({
    'gpt-duo': { models: ['kimi', 'kimi'] },
    'my-duo': { models: ['kimi', 'gpt-5.5'], judge: 'deepseek' },
    'bad-models': { models: ['no-such-model'] },
    'bad-judge': { models: ['kimi'], judge: 'no-such-model' },
    'too-many': { models: Array(9).fill('kimi') },
    'Bad Name': { models: ['kimi'] },
  }), 'utf8');
  const loaded = loadUserPresets(SCOPE);
  check('(c) shadowing row dropped on load', !('gpt-duo' in loaded));
  check('(c) unknown-model row dropped', !('bad-models' in loaded));
  check('(c) unknown-judge row dropped', !('bad-judge' in loaded));
  check('(c) >8-models row dropped', !('too-many' in loaded));
  check('(c) invalid-name row dropped', !('Bad Name' in loaded));
  check('(c) valid row survives', 'my-duo' in loaded);
  const merged = withUserPresets(DEFAULTS, SCOPE);
  check('(c) built-in gpt-duo panel intact after merge',
    JSON.stringify(resolvePanel({ preset: 'gpt-duo' }, merged)) === JSON.stringify(['gpt-5.5', 'gpt-5.5']));
  check('(c) built-in gpt-duo stages intact after merge',
    resolveJudgeModel({ preset: 'gpt-duo' }, merged) === 'gpt-5.5');
}

// (d) save validation errors
{
  check('(d) empty models refused', saveUserPreset('x1', { models: [] }, SCOPE).ok === false);
  check('(d) missing def refused', saveUserPreset('x1', undefined, SCOPE).ok === false);
  check('(d) >8 models refused', saveUserPreset('x1', { models: Array(9).fill('kimi') }, SCOPE).ok === false);
  const unk = saveUserPreset('x1', { models: ['kimi', 'nope'] }, SCOPE);
  check('(d) unknown model refused, named', unk.ok === false && unk.error.includes('nope'));
  check('(d) unknown judge refused', saveUserPreset('x1', { models: ['kimi'], judge: 'nope' }, SCOPE).ok === false);
  check('(d) unknown synth refused', saveUserPreset('x1', { models: ['kimi'], synth: 'nope' }, SCOPE).ok === false);
  check('(d) invalid name refused', validateUserPresetName('Bad Name!').ok === false);
  check('(d) leading dash refused', validateUserPresetName('-x').ok === false);
  check('(d) valid name accepted', validateUserPresetName('east-west-2').ok === true);
}

// (e) delete
{
  const d1 = deleteUserPreset('my-duo', SCOPE);
  check('(e) delete ok', d1.ok === true);
  check('(e) deleted preset gone', !('my-duo' in loadUserPresets(SCOPE)));
  const d2 = deleteUserPreset('my-duo', SCOPE);
  check('(e) delete missing refused', d2.ok === false && d2.error.includes('my-duo'));
}

// (f) defensive load: corrupt file / array / symlink-shaped failures -> {}
{
  fs.writeFileSync(userPresetsPath(SCOPE), 'NOT{JSON}', 'utf8');
  check('(f) corrupt file -> empty map', Object.keys(loadUserPresets(SCOPE)).length === 0);
  check('(f) corrupt file -> cfg identity', withUserPresets(DEFAULTS, SCOPE) === DEFAULTS);
  fs.writeFileSync(userPresetsPath(SCOPE), JSON.stringify(['not', 'a', 'map']), 'utf8');
  check('(f) array file -> empty map', Object.keys(loadUserPresets(SCOPE)).length === 0);
}

// (g) scope isolation: presets saved in one scope invisible to another
{
  try { fs.unlinkSync(userPresetsPath(SCOPE)); } catch {}
  saveUserPreset('iso-duo', { models: ['kimi', 'glm'] }, 'scope-a');
  check('(g) saved in scope-a', 'iso-duo' in loadUserPresets('scope-a'));
  check('(g) invisible in scope-b', !('iso-duo' in loadUserPresets('scope-b')));
  check('(g) default path has no scope suffix',
    userPresetsPath('default').endsWith('frontier-presets.json'));
  try { fs.unlinkSync(userPresetsPath('scope-a')); } catch {}
}

// cleanup
try { fs.rmSync(tmpBase, { recursive: true, force: true }); } catch {}

if (failures) {
  console.error(failures + ' test(s) failed.');
  process.exit(1);
} else {
  console.log('ok');
}
