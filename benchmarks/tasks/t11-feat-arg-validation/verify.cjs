'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

// Runner layout: fixture CONTENTS are copied beside this file in the work dir.
const fixtureDir = __dirname;

// ── helpers ─────────────────────────────────────────────────────────────────

function load(rel) {
  // bust require cache so multiple runs in the same process stay independent
  const abs = path.join(fixtureDir, rel);
  delete require.cache[require.resolve(abs)];
  return require(abs);
}

function mustThrow(fn, expectedMessage, label) {
  let caught = null;
  try { fn(); } catch (err) { caught = err; }
  assert.ok(caught instanceof Error, label + ': must throw Error');
  assert.strictEqual(caught.message, expectedMessage, label + ': exact message');
}

// ── 1. validate() unit tests ─────────────────────────────────────────────────

try {
  const { validate } = load('src/validation.js');
  assert.strictEqual(typeof validate, 'function', 'validation.js exports validate');

  // string type: passes through unchanged
  const r1 = validate([{ name: 'text', type: 'string' }], ['hello']);
  assert.deepStrictEqual(r1, ['hello'], 'string: passes through');

  // int type: converts to number
  const r2 = validate([{ name: 'n', type: 'int' }], ['42']);
  assert.deepStrictEqual(r2, [42], 'int: converts to number');
  assert.strictEqual(typeof r2[0], 'number', 'int: result is number type');

  // int type: negative int accepted
  const r3 = validate([{ name: 'n', type: 'int' }], ['-7']);
  assert.deepStrictEqual(r3, [-7], 'int: negative accepted');

  // positive-int type: positive integer accepted
  const r4 = validate([{ name: 'n', type: 'positive-int' }], ['3']);
  assert.deepStrictEqual(r4, [3], 'positive-int: accepted');

  // zero args, zero spec
  const r5 = validate([], []);
  assert.deepStrictEqual(r5, [], 'empty spec+args: ok');

  // int error: non-integer string -> exact message
  mustThrow(
    () => validate([{ name: 'a', type: 'int' }], ['xyz']),
    'a must be int',
    'int bad value'
  );

  // positive-int error: zero -> exact message
  mustThrow(
    () => validate([{ name: 'n', type: 'positive-int' }], ['0']),
    'n must be positive-int',
    'positive-int zero'
  );

  // positive-int error: negative -> exact message
  mustThrow(
    () => validate([{ name: 'n', type: 'positive-int' }], ['-1']),
    'n must be positive-int',
    'positive-int negative'
  );

  // positive-int error: non-numeric
  mustThrow(
    () => validate([{ name: 'times', type: 'positive-int' }], ['abc']),
    'times must be positive-int',
    'positive-int non-numeric'
  );

  // string type never fails on value (any string is valid)
  const r6 = validate([{ name: 's', type: 'string' }], ['']);
  assert.deepStrictEqual(r6, [''], 'string: empty string ok');

  // arity: too few args
  mustThrow(
    () => validate([{ name: 'a', type: 'int' }, { name: 'b', type: 'int' }], ['1']),
    'expected 2 args, got 1',
    'arity too few'
  );

  // arity: too many args
  mustThrow(
    () => validate([{ name: 'a', type: 'string' }], ['x', 'y']),
    'expected 1 args, got 2',
    'arity too many'
  );

  // first failing entry reported (not second)
  mustThrow(
    () => validate(
      [{ name: 'a', type: 'int' }, { name: 'b', type: 'int' }],
      ['bad', 'also-bad']
    ),
    'a must be int',
    'first failing entry'
  );

} catch (err) {
  console.error('FAIL: ' + err.message);
  process.exit(1);
}

// ── 2. All 14 commands export spec arrays ────────────────────────────────────

const COMMAND_SPECS = {
  add:    [{ name: 'a', type: 'int' },    { name: 'b', type: 'int' }],
  count:  [{ name: 'text', type: 'string' }],
  echo:   [{ name: 'text', type: 'string' }],
  head:   [{ name: 'text', type: 'string' }, { name: 'n', type: 'positive-int' }],
  join:   [{ name: 'left', type: 'string' }, { name: 'sep', type: 'string' }, { name: 'right', type: 'string' }],
  lower:  [{ name: 'text', type: 'string' }],
  mul:    [{ name: 'a', type: 'int' },    { name: 'b', type: 'int' }],
  ping:   [],
  repeat: [{ name: 'text', type: 'string' }, { name: 'times', type: 'positive-int' }],
  split:  [{ name: 'text', type: 'string' }, { name: 'sep', type: 'string' }],
  tail:   [{ name: 'text', type: 'string' }, { name: 'n', type: 'positive-int' }],
  trim:   [{ name: 'text', type: 'string' }],
  upper:  [{ name: 'text', type: 'string' }],
  wrap:   [{ name: 'text', type: 'string' }, { name: 'prefix', type: 'string' }, { name: 'suffix', type: 'string' }],
};

try {
  for (const [cmdName, expectedSpec] of Object.entries(COMMAND_SPECS)) {
    const mod = load('src/commands/' + cmdName + '.js');
    assert.ok(Array.isArray(mod.spec), cmdName + ': exports spec array');
    assert.strictEqual(mod.spec.length, expectedSpec.length,
      cmdName + ': spec has ' + expectedSpec.length + ' entries');
    for (let i = 0; i < expectedSpec.length; i++) {
      assert.strictEqual(mod.spec[i].name, expectedSpec[i].name,
        cmdName + ': spec[' + i + '].name');
      assert.strictEqual(mod.spec[i].type, expectedSpec[i].type,
        cmdName + ': spec[' + i + '].type');
    }
  }
} catch (err) {
  console.error('FAIL: ' + err.message);
  process.exit(1);
}

// ── 3. dispatch validates — bad args produce exact error strings ──────────────

try {
  const { dispatch } = load('src/dispatch.js');

  // add: non-int first arg
  assert.strictEqual(dispatch(['add', 'x', '2']), 'error: a must be int',
    'dispatch add bad a');
  // add: non-int second arg
  assert.strictEqual(dispatch(['add', '1', 'y']), 'error: b must be int',
    'dispatch add bad b');

  // count: arity (0 args)
  assert.strictEqual(dispatch(['count']), 'error: expected 1 args, got 0',
    'dispatch count arity 0');

  // echo: arity (2 args)
  assert.strictEqual(dispatch(['echo', 'a', 'b']), 'error: expected 1 args, got 2',
    'dispatch echo arity 2');

  // head: bad n (0 is not positive-int)
  assert.strictEqual(dispatch(['head', 'hello', '0']), 'error: n must be positive-int',
    'dispatch head bad n=0');

  // head: bad n (non-numeric)
  assert.strictEqual(dispatch(['head', 'hello', 'bad']), 'error: n must be positive-int',
    'dispatch head bad n=bad');

  // join: arity (2 args)
  assert.strictEqual(dispatch(['join', 'a', 'b']), 'error: expected 3 args, got 2',
    'dispatch join arity 2');

  // lower: arity (0)
  assert.strictEqual(dispatch(['lower']), 'error: expected 1 args, got 0',
    'dispatch lower arity 0');

  // mul: bad a
  assert.strictEqual(dispatch(['mul', 'x', '3']), 'error: a must be int',
    'dispatch mul bad a');

  // ping: arity (1 extra arg)
  assert.strictEqual(dispatch(['ping', 'extra']), 'error: expected 0 args, got 1',
    'dispatch ping arity 1');

  // repeat: bad times (0)
  assert.strictEqual(dispatch(['repeat', 'hi', '0']), 'error: times must be positive-int',
    'dispatch repeat bad times=0');

  // repeat: bad times (non-numeric)
  assert.strictEqual(dispatch(['repeat', 'hi', 'x']), 'error: times must be positive-int',
    'dispatch repeat bad times=x');

  // split: arity (1 arg)
  assert.strictEqual(dispatch(['split', 'hello']), 'error: expected 2 args, got 1',
    'dispatch split arity 1');

  // tail: bad n
  assert.strictEqual(dispatch(['tail', 'hello', '0']), 'error: n must be positive-int',
    'dispatch tail bad n=0');

  // trim: arity (2 args)
  assert.strictEqual(dispatch(['trim', 'a', 'b']), 'error: expected 1 args, got 2',
    'dispatch trim arity 2');

  // upper: arity (0)
  assert.strictEqual(dispatch(['upper']), 'error: expected 1 args, got 0',
    'dispatch upper arity 0');

  // wrap: arity (2 args)
  assert.strictEqual(dispatch(['wrap', 'text', '[']), 'error: expected 3 args, got 2',
    'dispatch wrap arity 2');

} catch (err) {
  console.error('FAIL: ' + err.message);
  process.exit(1);
}

// ── 4. Success paths byte-identical for all 14 commands ─────────────────────

try {
  const { dispatch } = load('src/dispatch.js');

  const cases = [
    { args: ['add', '3', '4'],          expected: '7' },
    { args: ['add', '-5', '10'],        expected: '5' },
    { args: ['count', 'hello'],         expected: '5' },
    { args: ['count', ''],              expected: '0' },
    { args: ['echo', 'world'],          expected: 'world' },
    { args: ['echo', ''],               expected: '' },
    { args: ['head', 'abcdef', '3'],    expected: 'abc' },
    { args: ['head', 'hi', '10'],       expected: 'hi' },
    { args: ['join', 'foo', '-', 'bar'], expected: 'foo-bar' },
    { args: ['join', 'a', '', 'b'],     expected: 'ab' },
    { args: ['lower', 'HELLO'],         expected: 'hello' },
    { args: ['lower', 'MiXeD'],         expected: 'mixed' },
    { args: ['mul', '6', '7'],          expected: '42' },
    { args: ['mul', '-3', '4'],         expected: '-12' },
    { args: ['ping'],                   expected: 'pong' },
    { args: ['repeat', 'ab', '3'],      expected: 'ababab' },
    { args: ['repeat', 'x', '1'],       expected: 'x' },
    { args: ['split', 'a,b,c', ','],    expected: 'a\nb\nc' },
    { args: ['split', 'hello', 'l'],    expected: 'he\n\no' },
    { args: ['tail', 'abcdef', '3'],    expected: 'def' },
    { args: ['tail', 'hi', '1'],        expected: 'i' },
    { args: ['trim', '  hi  '],         expected: 'hi' },
    { args: ['trim', 'ok'],             expected: 'ok' },
    { args: ['upper', 'hello'],         expected: 'HELLO' },
    { args: ['upper', 'MiXeD'],         expected: 'MIXED' },
    { args: ['wrap', 'text', '[', ']'], expected: '[text]' },
    { args: ['wrap', 'x', '', ''],      expected: 'x' },
  ];

  for (const { args, expected } of cases) {
    const label = 'dispatch ' + args.join(' ');
    const result = dispatch(args);
    assert.strictEqual(result, expected, label + ': expected ' + JSON.stringify(expected) + ' got ' + JSON.stringify(result));
  }

} catch (err) {
  console.error('FAIL: ' + err.message);
  process.exit(1);
}

// ── 5. Old ad-hoc validation gone from src/commands/*.js ────────────────────

try {
  const cmdDir = path.join(fixtureDir, 'src', 'commands');
  const files = fs.readdirSync(cmdDir).filter((f) => f.endsWith('.js') && f !== 'index.js');

  const forbiddenPatterns = [
    { re: /isNaN\s*\(/, label: 'isNaN() call' },
    { re: /is not a valid integer/, label: 'old error: is not a valid integer' },
    { re: /must be a positive integer/, label: 'old error: must be a positive integer' },
    { re: /must be a positive-int/, label: 'old error: must be a positive-int' },
    { re: /must be a number/, label: 'old error: must be a number' },
    { re: /typeof args\[/, label: 'typeof args[] guard' },
  ];

  for (const file of files) {
    const src = fs.readFileSync(path.join(cmdDir, file), 'utf8');
    for (const { re, label } of forbiddenPatterns) {
      assert.ok(!re.test(src), file + ': must not contain ' + label);
    }
  }

} catch (err) {
  console.error('FAIL: ' + err.message);
  process.exit(1);
}

// ── 6. Registry still alphabetical ──────────────────────────────────────────

try {
  const registry = load('src/commands/index.js');
  const keys = Object.keys(registry);
  const sorted = keys.slice().sort();
  assert.deepStrictEqual(keys, sorted, 'registry keys are in alphabetical order');
  assert.strictEqual(keys.length, 14, 'registry has 14 commands');
} catch (err) {
  console.error('FAIL: ' + err.message);
  process.exit(1);
}

// ── 7. docs/COMMANDS.md: Args lines present, sections alphabetical ───────────

try {
  const docsPath = path.join(fixtureDir, 'docs', 'COMMANDS.md');
  assert.ok(fs.existsSync(docsPath), 'docs/COMMANDS.md exists');
  const docs = fs.readFileSync(docsPath, 'utf8');

  const commands = ['add', 'count', 'echo', 'head', 'join', 'lower', 'mul',
                    'ping', 'repeat', 'split', 'tail', 'trim', 'upper', 'wrap'];

  // Every command has a ## section
  for (const cmd of commands) {
    assert.ok(new RegExp('^## ' + cmd + '$', 'm').test(docs),
      'COMMANDS.md has ## ' + cmd + ' section');
  }

  // Sections are alphabetical
  const positions = {};
  for (const cmd of commands) {
    positions[cmd] = docs.indexOf('## ' + cmd);
  }
  for (let i = 0; i < commands.length - 1; i++) {
    assert.ok(positions[commands[i]] < positions[commands[i + 1]],
      'COMMANDS.md: ' + commands[i] + ' before ' + commands[i + 1]);
  }

  // Non-ping commands have at least one "Args: " line in their section
  for (let i = 0; i < commands.length; i++) {
    const cmd = commands[i];
    const start = docs.indexOf('## ' + cmd);
    const end = i + 1 < commands.length
      ? docs.indexOf('## ' + commands[i + 1])
      : docs.length;
    const section = docs.slice(start, end);
    if (cmd === 'ping') {
      // ping takes no args -- either "Args: (none)" or no Args line at all
      // We accept both; just ensure the section exists (checked above)
      continue;
    }
    assert.ok(/^Args: /m.test(section),
      'COMMANDS.md ## ' + cmd + ' section has at least one Args: line');
  }

} catch (err) {
  console.error('FAIL: ' + err.message);
  process.exit(1);
}

console.log('PASS');
