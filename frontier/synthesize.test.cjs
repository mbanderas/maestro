#!/usr/bin/env node
// Tests for frontier/synthesize.cjs — fake-spawn injection, no real CLI.

'use strict';

const { buildSynthPrompt, runSynth } = require('./synthesize.cjs');
const { DEFAULTS } = require('./config.cjs');

let failures = 0;

function check(name, cond) {
  if (!cond) {
    console.error('FAIL:', name);
    failures++;
  } else {
    console.log('PASS:', name);
  }
}

const sampleAnalysis = {
  consensus: ['Water boils at 100C'],
  contradictions: [],
  partial_coverage: [],
  unique_insights: [],
  blind_spots: ['pressure effects'],
};

// ── (a) analysis present: prompt has 'majority'; runSynth returns content ─────
async function testA() {
  const bundle = { analysis: sampleAnalysis, responses: [] };
  const prompt = buildSynthPrompt('What temperature does water boil?', bundle, DEFAULTS);
  check('(a) prompt contains "majority"', /majority/i.test(prompt));
  check('(a) prompt contains analysis content', prompt.includes('Water boils at 100C'));

  const fakeSpawn = async () => ({ ok: true, content: 'FINAL' });
  const result = await runSynth('What temperature does water boil?', bundle, DEFAULTS, { spawn: fakeSpawn });
  check('(a) runSynth returns content string', result === 'FINAL');
}

// ── (b) analysis absent: prompt embeds raw responses + majority clause ────────
async function testB() {
  const bundle = { responses: [{ model: 'opus', content: 'RAW1' }] };
  const prompt = buildSynthPrompt('Some question?', bundle, DEFAULTS);
  check('(b) prompt contains "majority"', /majority/i.test(prompt));
  check('(b) prompt contains RAW1', prompt.includes('RAW1'));

  const fakeSpawn = async () => ({ ok: true, content: 'F2' });
  const result = await runSynth('Some question?', bundle, DEFAULTS, { spawn: fakeSpawn });
  check('(b) runSynth returns F2', result === 'F2');
}

// ── (c) ok:false spawn -> returns empty string ────────────────────────────────
async function testC() {
  const bundle = { responses: [] };
  const fakeSpawn = async () => ({ ok: false, error: 'timeout' });
  const result = await runSynth('q', bundle, DEFAULTS, { spawn: fakeSpawn });
  check('(c) ok:false -> empty string', result === '');
}

(async () => {
  await testA();
  await testB();
  await testC();

  if (failures > 0) {
    console.error('\n' + failures + ' test(s) failed.');
    process.exit(1);
  } else {
    console.log('\nAll tests passed.');
  }
})();
