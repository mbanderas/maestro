'use strict';

// Spawn + gate-verdict parser for captured stream/session JSONL
// (zero-dep node). Event-type-classified: counts only assistant-event
// tool_use blocks named Task/Agent (raw text grep false-positives on
// the init-event tools list), and only assistant-event text blocks for
// GATE verdict lines (AGENTS.md contains "GATE:" strings, so
// tool_result file-read echoes are noise, not evidence).
//
// Usage: node benchmarks/parse-spawns.cjs <file.jsonl> [...more]
//        node benchmarks/parse-spawns.cjs --dir <dir>

const fs = require('node:fs');
const path = require('node:path');

// Matches both verdict shapes: "GATE: single-agent — ..." and the
// counted form "GATE: files=7 concerns=3 -> multi-agent — ...".
const VERDICT_RE = /GATE:.*?(single|multi)-agent/;

function parseFile(file) {
  const spawns = [];
  const verdicts = [];
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  for (const line of lines) {
    if (!line.trim()) continue;
    let ev;
    try { ev = JSON.parse(line); } catch { continue; }
    if (ev.type !== 'assistant') continue;
    const content = ev.message && ev.message.content;
    if (!Array.isArray(content)) continue;
    for (const b of content) {
      if (b.type === 'tool_use' && (b.name === 'Task' || b.name === 'Agent')) {
        spawns.push({
          subagent_type: (b.input && b.input.subagent_type) || null,
          description: (b.input && b.input.description) || null,
        });
      } else if (b.type === 'text' && VERDICT_RE.test(b.text)) {
        const m = b.text.split('\n').find((l) => VERDICT_RE.test(l));
        verdicts.push(m.trim());
      }
    }
  }
  return { file: path.basename(file), spawns, verdicts };
}

function main() {
  let files = [];
  const dirIdx = process.argv.indexOf('--dir');
  if (dirIdx > -1) {
    const dir = process.argv[dirIdx + 1];
    files = fs.readdirSync(dir)
      .filter((f) => f.endsWith('.jsonl'))
      .map((f) => path.join(dir, f));
  } else {
    files = process.argv.slice(2);
  }
  if (!files.length) {
    console.error('usage: node parse-spawns.cjs <file.jsonl> [...] | --dir <dir>');
    process.exit(2);
  }
  const out = files.map(parseFile);
  console.log(JSON.stringify(out, null, 2));
}

main();
