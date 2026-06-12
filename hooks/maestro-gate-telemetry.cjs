#!/usr/bin/env node
// Maestro SessionEnd gate telemetry. Strictly opt-in, strictly local.
//
// Records one JSON line per session so you can audit your own Decision
// Gate behavior over time (AGENTS.md S1): did the session route
// single-agent or multi-agent, how many specialists were spawned, and
// how the session ended.
//
// Privacy: does nothing unless MAESTRO_TELEMETRY=1. Writes only to
// ~/.claude/maestro-telemetry.jsonl on this machine. No network, ever.
// Captures counts and the project folder NAME only -- no prompts, no
// file contents, no paths beyond the basename.
//
// Payload fields verified against code.claude.com/docs/en/hooks
// (SessionEnd input: session_id, transcript_path, cwd, reason;
// SessionEnd output cannot block), 2026-06-10.
//
// .cjs so Node treats it as CommonJS regardless of any "type": "module"
// package.json in a parent directory of the install location.
//
// Install: see README "Claude Code: Gate Telemetry".

const fs = require('fs');
const os = require('os');
const path = require('path');

if (process.env.MAESTRO_TELEMETRY !== '1') process.exit(0);

let data = {};
try { data = JSON.parse(fs.readFileSync(0, 'utf8')); } catch { process.exit(0); }

// Spawn count alone misses the measured failure mode: a multi-agent
// verdict stated in text but no specialist ever spawned. Parse the S1
// verdict line too and record verdict vs spawned separately; mismatch
// flags either direction (multi verdict with 0 spawns, single verdict
// with spawns). Last verdict line wins (re-gated mid-session).
const verdictRe = /GATE:\s*files=\S+\s+concerns=\S+\s*->\s*(single|multi)-agent/;
let agentCount = 0;
let verdict = null;
if (data.transcript_path && fs.existsSync(data.transcript_path)) {
  try {
    const buf = fs.readFileSync(data.transcript_path, 'utf8');
    const text = buf.length > 8000000 ? buf.slice(-8000000) : buf;
    for (const line of text.split('\n')) {
      let e;
      try { e = JSON.parse(line); } catch { continue; }
      if (!e || e.type !== 'assistant' || !e.message || !Array.isArray(e.message.content)) continue;
      for (const item of e.message.content) {
        if (!item) continue;
        if (item.type === 'tool_use' && (item.name === 'Task' || item.name === 'Agent')) agentCount++;
        if (item.type === 'text' && typeof item.text === 'string') {
          const m = item.text.match(verdictRe);
          if (m) verdict = m[1];
        }
      }
    }
  } catch {}
}

const row = {
  ts: new Date().toISOString(),
  session_id: data.session_id || null,
  gate: agentCount > 0 ? 'multi' : 'single',
  verdict,
  agent_count: agentCount,
  mismatch: verdict !== null && ((verdict === 'multi') !== (agentCount > 0)),
  reason: data.reason || null,
  project: data.cwd ? path.basename(data.cwd) : null
};

try {
  const dir = path.join(os.homedir(), '.claude');
  fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(path.join(dir, 'maestro-telemetry.jsonl'), JSON.stringify(row) + '\n');
} catch {}

process.exit(0);
