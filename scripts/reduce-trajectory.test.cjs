#!/usr/bin/env node
// Tests for scripts/reduce-trajectory.cjs. Zero dependencies.

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const reducer = require('./reduce-trajectory.cjs');
const SCRIPT = path.join(__dirname, 'reduce-trajectory.cjs');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-reduce-test-'));

let failures = 0;
function check(name, cond) {
  if (cond) console.log(`  ok    ${name}`);
  else { failures++; console.error(`  FAIL  ${name}`); }
}

function writeJson(file, value) {
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
}

console.log('reduce-trajectory tests');

const resultFile = path.join(tmp, 'results.json');
writeJson(resultFile, [
  {
    task: 't01-fix-inclusive-range',
    cli: 'claude',
    model: 'sonnet',
    mode: 'on',
    run: 1,
    pass: true,
    is_error: false,
    wall_ms: 1234,
    agent_ms: 1000,
    num_turns: 5,
    cost_usd: 0.12,
    in_tokens: 10,
    out_tokens: 20,
    cache_read: 30,
    cache_write: 40,
    hook_set: 'pack',
    stream_file: 'streams/x.jsonl',
    timestamp: '2026-06-12T00:00:00Z'
  },
  {
    task: 't02-fix-even-median',
    mode: 'off'
  }
]);

const jsonRows = reducer.reduceResultJson(resultFile);
check('result json -> one row per result', jsonRows.length === 2);
check('result json keeps token fields', jsonRows[0].cache_read_tokens === 30);
check('missing usage fields become null', jsonRows[1].output_tokens === null);

const streamFile = path.join(tmp, 't12-feat-export-subsystem-on-r3.jsonl');
const streamEvents = [
  { type: 'system', model: 'claude-sonnet-test', session_id: 's1' },
  'not json',
  {
    type: 'assistant',
    session_id: 's1',
    message: {
      model: 'claude-sonnet-test',
      content: [
        { type: 'text', text: 'GATE: files=6 concerns=3 -> multi-agent - trigger met' },
        { type: 'tool_use', name: 'Task', input: { description: 'plan' } },
        { type: 'tool_use', name: 'Write', input: { file_path: 'x.js' } },
        { type: 'tool_use', name: 'Bash', input: { command: 'node x.js' } }
      ]
    }
  },
  {
    type: 'result',
    is_error: false,
    duration_ms: 42,
    num_turns: 7,
    total_cost_usd: 0.5,
    result: 'VERIFIED',
    usage: {
      input_tokens: 1,
      output_tokens: 2,
      cache_read_input_tokens: 3,
      cache_creation_input_tokens: 4
    }
  }
];
fs.writeFileSync(streamFile, streamEvents.map((ev) => (
  typeof ev === 'string' ? ev : JSON.stringify(ev)
)).join('\n'));

const streamRows = reducer.reduceStreamJsonl(streamFile);
check('stream jsonl -> one row', streamRows.length === 1);
check('stream filename infers task/mode/run', streamRows[0].task === 't12-feat-export-subsystem' && streamRows[0].mode === 'on' && streamRows[0].run === 3);
check('stream counts malformed lines', streamRows[0].malformed_lines === 1);
check('stream counts tool classes', streamRows[0].task_agent_spawns === 1 && streamRows[0].mutation_tool_uses === 1 && streamRows[0].bash_tool_uses === 1);
check('stream keeps status and usage', streamRows[0].status_token === 'VERIFIED' && streamRows[0].cache_write_tokens === 4);

const cliOut = execFileSync(process.execPath, [SCRIPT, tmp], { encoding: 'utf8' });
const cliRows = JSON.parse(cliOut);
check('cli accepts directory and emits json', cliRows.length === 3);
check('cli distinguishes source types', new Set(cliRows.map((r) => r.source_type)).size === 2);

try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}

if (failures) { console.error(`${failures} failure(s)`); process.exit(1); }
console.log('all tests passed');
