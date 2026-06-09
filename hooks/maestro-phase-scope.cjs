#!/usr/bin/env node
// Maestro PostToolUse phase-scope guard. Enforces AGENTS.md S7.1
// structurally: max 5 files modified per phase. Counts distinct files
// touched by Edit/Write/NotebookEdit since the last real user prompt
// (one turn ~ one phase for interactive work) and warns once per turn
// when the count exceeds MAESTRO_PHASE_FILE_CAP (default 5).
//
// Wire with matcher "Edit|Write|NotebookEdit" so it only runs on
// file-modifying tools. Soft warning via additionalContext -- never
// blocks; the agent decides whether the scope is justified (e.g. a
// user-approved bulk rename). Degrades silently on missing payload
// fields. Payload fields verified against code.claude.com/docs/en/hooks
// (PostToolUse input: tool_name, tool_input, transcript_path;
// output: hookSpecificOutput.additionalContext), 2026-06-10.
//
// .cjs so Node treats it as CommonJS regardless of any "type": "module"
// package.json in a parent directory of the install location.
//
// Install: see README "Claude Code: Phase-Scope Guard".

const fs = require('fs');

const MUTATORS = new Set(['Edit', 'Write', 'NotebookEdit']);
const MARKER = 'Maestro phase-scope guard:';

let data = {};
try { data = JSON.parse(fs.readFileSync(0, 'utf8')); } catch { process.exit(0); }

let lines = [];
if (data.transcript_path && fs.existsSync(data.transcript_path)) {
  try {
    const buf = fs.readFileSync(data.transcript_path, 'utf8');
    lines = (buf.length > 4000000 ? buf.slice(-4000000) : buf).split('\n');
  } catch {}
}

// Locate the last genuine user prompt (typed text, not a tool_result
// carrier). Everything after it is the current turn.
let turnStart = 0;
const parsed = lines.map(l => { try { return JSON.parse(l); } catch { return null; } });
for (let i = 0; i < parsed.length; i++) {
  const e = parsed[i];
  if (!e || e.type !== 'user' || e.isMeta || !e.message) continue;
  const c = e.message.content;
  const genuine = typeof c === 'string'
    ? true
    : Array.isArray(c) && c.some(x => x && x.type === 'text') && !c.some(x => x && x.type === 'tool_result');
  if (genuine) turnStart = i;
}

// Fire once per turn.
for (let i = turnStart; i < lines.length; i++) {
  if (lines[i].includes(MARKER)) process.exit(0);
}

const files = new Set();
for (let i = turnStart; i < parsed.length; i++) {
  const e = parsed[i];
  if (!e || e.type !== 'assistant' || !e.message || !Array.isArray(e.message.content)) continue;
  for (const item of e.message.content) {
    if (item && item.type === 'tool_use' && MUTATORS.has(item.name) && item.input) {
      const p = item.input.file_path || item.input.notebook_path;
      if (p) files.add(p);
    }
  }
}
// The triggering call may not be in the transcript yet.
if (MUTATORS.has(data.tool_name) && data.tool_input) {
  const p = data.tool_input.file_path || data.tool_input.notebook_path;
  if (p) files.add(p);
}

const cap = parseInt(process.env.MAESTRO_PHASE_FILE_CAP, 10) || 5;
if (files.size > cap) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PostToolUse',
      additionalContext: `${MARKER} ${files.size} distinct files modified this turn exceeds the max-${cap}-files-per-phase rule (AGENTS.md S7.1). Complete and verify the current phase before expanding scope, or split the remaining work into a follow-up phase. If the user explicitly approved a wider batch (e.g. a bulk rename), proceed.`
    }
  }));
}

process.exit(0);
