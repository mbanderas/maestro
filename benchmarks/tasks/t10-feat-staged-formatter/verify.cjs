'use strict';

const assert = require('node:assert');

try {
  const lib = require('./src/index.js');
  const { renderTable, renderTableLegacy } = lib;

  assert.strictEqual(typeof renderTable, 'function', 'renderTable exported from barrel');

  // --- Stage 1: basic left-aligned table ---

  // Primary example (byte-exact)
  assert.strictEqual(
    renderTable([['id', 'name'], ['1', 'Ada Lovelace'], ['42', 'Bo']]),
    'id name\n1  Ada Lovelace\n42 Bo',
    'stage1: primary example'
  );

  // Single row, single column
  assert.strictEqual(
    renderTable([['hello']]),
    'hello',
    'stage1: single row single column'
  );

  // Equal-width cells
  assert.strictEqual(
    renderTable([['ab', 'cd'], ['ef', 'gh']]),
    'ab cd\nef gh',
    'stage1: equal-width cells'
  );

  // Column where widest cell is in the last row
  assert.strictEqual(
    renderTable([['a', 'x'], ['bb', 'yy'], ['ccc', 'zzz']]),
    'a   x\nbb  yy\nccc zzz',
    'stage1: widest cell in last row'
  );

  // No trailing spaces on any line
  const s1 = renderTable([['id', 'name'], ['1', 'Ada Lovelace'], ['42', 'Bo']]);
  s1.split('\n').forEach((line, i) => {
    assert.ok(!line.endsWith(' '), `stage1: no trailing space on line ${i}: ${JSON.stringify(line)}`);
  });

  // --- Stage 2: options.align ---

  // Default options call byte-identical to Stage 1 on same input
  const s1Input = [['id', 'name'], ['1', 'Ada Lovelace'], ['42', 'Bo']];
  assert.strictEqual(
    renderTable(s1Input, { align: ['left', 'left'] }),
    renderTable(s1Input),
    'stage2: explicit all-left equals no-options'
  );

  // options.align omitted: byte-identical to Stage 1
  assert.strictEqual(
    renderTable(s1Input, {}),
    renderTable(s1Input),
    'stage2: empty options object equals no-options'
  );

  // Right-align example (byte-exact)
  assert.strictEqual(
    renderTable([['id', 'qty'], ['7', '100'], ['1234', '5']], { align: ['right', 'right'] }),
    '  id qty\n   7 100\n1234   5',
    'stage2: right-align example'
  );

  // Mixed left/right alignment
  assert.strictEqual(
    renderTable([['name', 'score'], ['Alice', '100'], ['Bob', '5']], { align: ['left', 'right'] }),
    'name  score\nAlice   100\nBob       5',
    'stage2: mixed left/right'
  );

  // Right-aligned last column: no trailing spaces anywhere
  const s2 = renderTable([['id', 'qty'], ['7', '100'], ['1234', '5']], { align: ['right', 'right'] });
  s2.split('\n').forEach((line, i) => {
    assert.ok(!line.endsWith(' '), `stage2: no trailing space on line ${i}: ${JSON.stringify(line)}`);
  });

  // --- Stage 3: options.header and renderTableLegacy ---

  // Header example (byte-exact)
  assert.strictEqual(
    renderTable([['id', 'name'], ['1', 'Bo']], { header: true }),
    'id name\n-------\n1  Bo',
    'stage3: header example'
  );

  // Header + align combined
  assert.strictEqual(
    renderTable([['name', 'pts'], ['Alice', '10'], ['Bob', '200']], { header: true, align: ['left', 'right'] }),
    'name  pts\n---------\nAlice  10\nBob   200',
    'stage3: header + align'
  );

  // renderTableLegacy exported
  assert.strictEqual(typeof renderTableLegacy, 'function', 'renderTableLegacy exported from barrel');

  // renderTableLegacy equals Stage 1 on three different inputs
  assert.strictEqual(
    renderTableLegacy([['id', 'name'], ['1', 'Ada Lovelace'], ['42', 'Bo']]),
    'id name\n1  Ada Lovelace\n42 Bo',
    'stage3: renderTableLegacy matches stage1 (input A)'
  );
  assert.strictEqual(
    renderTableLegacy([['a', 'x'], ['bb', 'yy'], ['ccc', 'zzz']]),
    'a   x\nbb  yy\nccc zzz',
    'stage3: renderTableLegacy matches stage1 (input B)'
  );
  assert.strictEqual(
    renderTableLegacy([['ab', 'cd'], ['ef', 'gh']]),
    'ab cd\nef gh',
    'stage3: renderTableLegacy matches stage1 (input C)'
  );

  // --- Regression traps ---

  // Stage 1 primary example again (catches mutation of defaults by later stages)
  assert.strictEqual(
    renderTable([['id', 'name'], ['1', 'Ada Lovelace'], ['42', 'Bo']]),
    'id name\n1  Ada Lovelace\n42 Bo',
    'regression: stage1 primary example still holds after all stages'
  );

  // options={} byte-equal to no-options call
  const regInput = [['x', 'yy'], ['zzz', 'w']];
  assert.strictEqual(
    renderTable(regInput, {}),
    renderTable(regInput),
    'regression: options={} byte-equal to no-options'
  );

  console.log('PASS');
} catch (err) {
  console.error('FAIL: ' + err.message);
  process.exit(1);
}
