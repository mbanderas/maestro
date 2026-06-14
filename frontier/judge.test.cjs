#!/usr/bin/env node
// Tests for frontier/judge.cjs — fake-spawn injection, no real CLI.

'use strict';

const { buildJudgePrompt, runJudge } = require('./judge.cjs');
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

// Shared valid Analysis fixture
const validAnalysis = {
  consensus: ['The sky is blue'],
  contradictions: [{ topic: 'gravity', stances: [{ model: 'opus', stance: 'strong' }] }],
  partial_coverage: [{ models: ['opus'], point: 'tides' }],
  unique_insights: [{ model: 'gpt-5.5', insight: 'moon affects tides' }],
  blind_spots: ['dark matter'],
};

// ── (a) ok spawn with valid JSON -> returns Analysis ──────────────────────────
async function testA() {
  const fakeSpawn = async () => ({ ok: true, content: JSON.stringify(validAnalysis) });
  const result = await runJudge('Tell me about space.', [], DEFAULTS, { spawn: fakeSpawn });
  check('(a) result is object', result !== null && typeof result === 'object');
  check('(a) consensus is array', Array.isArray(result && result.consensus));
  check('(a) consensus[0] value', result && result.consensus[0] === 'The sky is blue');
}

// ── (b) ok spawn but non-JSON content -> returns undefined ────────────────────
async function testB() {
  const fakeSpawn = async () => ({ ok: true, content: 'totally not json' });
  const result = await runJudge('q', [], DEFAULTS, { spawn: fakeSpawn });
  check('(b) non-JSON -> undefined', result === undefined);
}

// ── (c) failed spawn (ok:false) -> returns undefined ─────────────────────────
async function testC() {
  const fakeSpawn = async () => ({ ok: false, error: 'boom' });
  const result = await runJudge('q', [], DEFAULTS, { spawn: fakeSpawn });
  check('(c) ok:false -> undefined', result === undefined);
}

// ── (d) ok spawn with prose wrapper -> substring recovery returns Analysis ────
async function testD() {
  const wrapped =
    'Sure, here is the analysis:\n' + JSON.stringify(validAnalysis) + '\nHope that helps.';
  const fakeSpawn = async () => ({ ok: true, content: wrapped });
  const result = await runJudge('q', [], DEFAULTS, { spawn: fakeSpawn });
  check('(d) substring recovery -> object', result !== null && typeof result === 'object');
  check('(d) substring recovery -> consensus present', Array.isArray(result && result.consensus));
  check('(d) substring recovery -> blind_spots present', Array.isArray(result && result.blind_spots));
}

// ── (e) buildJudgePrompt includes expected content ────────────────────────────
function testE() {
  const responses = [
    { model: 'opus', content: 'AA' },
    { model: 'gpt-5.5', content: 'BB' },
  ];
  const prompt = buildJudgePrompt('What is gravity?', responses, DEFAULTS);
  check('(e) contains AA', prompt.includes('AA'));
  check('(e) contains BB', prompt.includes('BB'));
  check('(e) contains opus', prompt.includes('opus'));
  check('(e) contains gpt-5.5', prompt.includes('gpt-5.5'));
  check('(e) contains consensus', prompt.includes('consensus'));
  check('(e) contains blind_spots', prompt.includes('blind_spots'));
  check('(e) contains compare (case-insensitive)', /compare/i.test(prompt));
}

(async () => {
  testE();
  await testA();
  await testB();
  await testC();
  await testD();

  if (failures > 0) {
    console.error('\n' + failures + ' test(s) failed.');
    process.exit(1);
  } else {
    console.log('\nAll tests passed.');
  }
})();
