#!/usr/bin/env node
// Reduce raw Maestro benchmark result/stream artifacts into compact
// per-run facts for audits. Read-only, zero dependencies.
//
// Usage:
//   node scripts/reduce-trajectory.cjs <file-or-dir> [...]
//
// Inputs:
// - benchmarks/results/*.json runner result arrays
// - benchmarks/results/streams/**/*.jsonl stream-json logs

'use strict';

const fs = require('fs');
const path = require('path');

const STATUS_RE = /\b(VERIFIED|PENDING_REVIEW|UNVERIFIED|FAIL)\b/;
const GATE_RE = /GATE:.*?(single|multi)-agent/;
const MUTATION_TOOLS = new Set(['Edit', 'Write', 'NotebookEdit']);

function maybeNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function inferFromStreamName(file) {
  const base = path.basename(file, '.jsonl');
  const m = base.match(/^(.*)-(on|off|core|proxy)-r(\d+)$/);
  if (!m) return { task: null, mode: null, run: null };
  return { task: m[1], mode: m[2], run: Number(m[3]) };
}

function reduceResultRow(row, file) {
  return {
    source_type: 'result-json',
    source_file: path.normalize(file),
    task: row.task || null,
    cli: row.cli || null,
    model: row.model || null,
    mode: row.mode || null,
    run: maybeNumber(row.run),
    pass: typeof row.pass === 'boolean' ? row.pass : null,
    is_error: typeof row.is_error === 'boolean' ? row.is_error : null,
    verify_note: row.verify_note || null,
    wall_ms: maybeNumber(row.wall_ms),
    agent_ms: maybeNumber(row.agent_ms),
    num_turns: maybeNumber(row.num_turns),
    cost_usd: maybeNumber(row.cost_usd),
    input_tokens: maybeNumber(row.in_tokens),
    output_tokens: maybeNumber(row.out_tokens),
    cache_read_tokens: maybeNumber(row.cache_read),
    cache_write_tokens: maybeNumber(row.cache_write),
    hook_set: row.hook_set || null,
    think_cap: maybeNumber(row.think_cap),
    stream_file: row.stream_file || null,
    timestamp: row.timestamp || null,
  };
}

function reduceResultJson(file) {
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    return [{
      source_type: 'result-json',
      source_file: path.normalize(file),
      parse_error: err.message,
    }];
  }
  const rows = Array.isArray(parsed) ? parsed : [parsed];
  return rows.map((row) => reduceResultRow(row && typeof row === 'object' ? row : {}, file));
}

function reduceStreamJsonl(file) {
  const inferred = inferFromStreamName(file);
  const out = {
    source_type: 'stream-jsonl',
    source_file: path.normalize(file),
    task: inferred.task,
    cli: 'claude',
    model: null,
    mode: inferred.mode,
    run: inferred.run,
    session_id: null,
    is_error: null,
    duration_ms: null,
    num_turns: null,
    cost_usd: null,
    input_tokens: null,
    output_tokens: null,
    cache_read_tokens: null,
    cache_write_tokens: null,
    assistant_messages: 0,
    tool_uses: 0,
    mutation_tool_uses: 0,
    bash_tool_uses: 0,
    task_agent_spawns: 0,
    gate_verdicts: [],
    status_token: null,
    malformed_lines: 0,
  };

  const text = fs.readFileSync(file, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    let ev;
    try {
      ev = JSON.parse(line);
    } catch {
      out.malformed_lines++;
      continue;
    }
    if (!ev || typeof ev !== 'object') continue;

    if (ev.session_id && !out.session_id) out.session_id = ev.session_id;
    if (ev.type === 'system' && ev.model && !out.model) out.model = ev.model;

    if (ev.type === 'assistant' && ev.message && Array.isArray(ev.message.content)) {
      out.assistant_messages++;
      if (ev.message.model && !out.model) out.model = ev.message.model;
      for (const item of ev.message.content) {
        if (!item || typeof item !== 'object') continue;
        if (item.type === 'tool_use') {
          out.tool_uses++;
          if (MUTATION_TOOLS.has(item.name)) out.mutation_tool_uses++;
          if (item.name === 'Bash') out.bash_tool_uses++;
          if (item.name === 'Task' || item.name === 'Agent') out.task_agent_spawns++;
        } else if (item.type === 'text' && typeof item.text === 'string') {
          const gate = item.text.split('\n').find((l) => GATE_RE.test(l));
          if (gate) out.gate_verdicts.push(gate.trim());
          const status = item.text.match(STATUS_RE);
          if (status) out.status_token = status[1];
        }
      }
    }

    if (ev.type === 'result') {
      out.is_error = typeof ev.is_error === 'boolean' ? ev.is_error : null;
      out.duration_ms = maybeNumber(ev.duration_ms);
      out.num_turns = maybeNumber(ev.num_turns);
      out.cost_usd = maybeNumber(ev.total_cost_usd);
      const usage = ev.usage || {};
      out.input_tokens = maybeNumber(usage.input_tokens);
      out.output_tokens = maybeNumber(usage.output_tokens);
      out.cache_read_tokens = maybeNumber(usage.cache_read_input_tokens);
      out.cache_write_tokens = maybeNumber(usage.cache_creation_input_tokens);
      if (typeof ev.result === 'string') {
        const status = ev.result.match(STATUS_RE);
        if (status) out.status_token = status[1];
      }
    }
  }

  return [out];
}

function collectFiles(input) {
  const stat = fs.statSync(input);
  if (stat.isDirectory()) {
    return fs.readdirSync(input)
      .flatMap((name) => collectFiles(path.join(input, name)))
      .filter((file) => file.endsWith('.json') || file.endsWith('.jsonl'));
  }
  return [input];
}

function reduceFiles(inputs) {
  const files = inputs.flatMap(collectFiles).sort();
  return files.flatMap((file) => {
    if (file.endsWith('.jsonl')) return reduceStreamJsonl(file);
    if (file.endsWith('.json')) return reduceResultJson(file);
    return [];
  });
}

function main() {
  const inputs = process.argv.slice(2);
  if (!inputs.length) {
    console.error('usage: node scripts/reduce-trajectory.cjs <file-or-dir> [...]');
    process.exit(2);
  }
  console.log(JSON.stringify(reduceFiles(inputs), null, 2));
}

module.exports = {
  inferFromStreamName,
  reduceFiles,
  reduceResultJson,
  reduceStreamJsonl,
};

if (require.main === module) main();
