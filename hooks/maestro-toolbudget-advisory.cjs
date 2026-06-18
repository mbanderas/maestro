#!/usr/bin/env node
// Maestro PostToolUse tool-call budget advisory (Fable T1). Log-only,
// zero prompt tokens, never blocks.
//
// Fable scales tool calls to task complexity (1 for single facts; 3-5
// medium; 5-10 deep research). Maestro caps subagent tool budgets (S9)
// but nothing watches the ORCHESTRATOR's own pre-edit exploration. This
// hook measures how many exploration (non-edit) tool calls happened this
// turn before the FIRST file edit; if that exceeds a budget it appends
// one advisory row to a local log. It is a behavioural lever, evidence-
// gated: log-only first, so a preregistered OFF/ON fixture can show the
// signal separates before anyone promotes it to an enforcing warning.
//
// Design choices:
// - Fires on PostToolUse for edit tools; evaluates once per turn at the
//   first-edit boundary (a per-turn marker file makes it idempotent).
// - "Turn" = everything since the last genuine user prompt, located from
//   the transcript with the same heuristic as maestro-phase-scope.
// - ZERO prompt tokens: never writes stdout / additionalContext, so it
//   adds nothing to context. It only appends a counts-only JSON row.
// - NEVER blocks: PostToolUse cannot block and this emits no decision.
// - Privacy: records counts + project folder basename only -- no
//   prompts, no file contents, no paths. No network, ever.
//
// Env:
// - MAESTRO_TOOLBUDGET=0           disable entirely (default: active, log-only)
// - MAESTRO_TOOLBUDGET_THRESHOLD   exploration-call budget (default 20)
// - MAESTRO_TOOLBUDGET_LOG         override log path (default ~/.claude/maestro-toolbudget.jsonl)
// - MAESTRO_TOOLBUDGET_MARKERDIR   override per-turn marker dir (default OS tmp)
//
// Promotion path (NOT shipped, pending fixture evidence): a `warn` mode
// that emits additionalContext at the first edit. Kept out until the log
// shows the budget separates real over-exploration from normal work.
//
// Payload fields verified against code.claude.com/docs/en/hooks
// (PostToolUse input: session_id, transcript_path, cwd, tool_name,
// tool_input; PostToolUse output cannot block), 2026-06-16.
//
// .cjs so Node treats it as CommonJS regardless of any "type": "module"
// package.json in a parent directory of the install location.

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

if (process.env.MAESTRO_TOOLBUDGET === '0') process.exit(0);

const EDIT_TOOLS = new Set(['Edit', 'Write', 'NotebookEdit', 'MultiEdit']);

let data = {};
try { data = JSON.parse(fs.readFileSync(0, 'utf8')); } catch { process.exit(0); }
// Discipline runtime toggle (settings `discipline off`): silence the pack.
if (!require('./maestro-discipline-gate.cjs').disciplineEnabled()) process.exit(0);

// Only the first edit of a turn matters; ignore every non-edit tool.
if (!EDIT_TOOLS.has(data.tool_name)) process.exit(0);

// Counting exploration before the first edit needs the transcript.
if (!data.transcript_path || !fs.existsSync(data.transcript_path)) process.exit(0);

let lines = [];
try {
  const buf = fs.readFileSync(data.transcript_path, 'utf8');
  lines = (buf.length > 4000000 ? buf.slice(-4000000) : buf).split(/\r?\n/);
} catch { process.exit(0); }

const parsed = lines.map(l => { try { return JSON.parse(l); } catch { return null; } });

// Locate the last genuine user prompt (typed text, not a tool_result
// carrier); everything after it is the current turn.
let turnStart = 0;
for (let i = 0; i < parsed.length; i++) {
  const e = parsed[i];
  if (!e || e.type !== 'user' || e.isMeta || !e.message) continue;
  const c = e.message.content;
  const genuine = typeof c === 'string'
    ? true
    : Array.isArray(c) && c.some(x => x && x.type === 'text') && !c.some(x => x && x.type === 'tool_result');
  if (genuine) turnStart = i;
}

// Evaluate at most once per turn, at the first-edit boundary.
const markerDir = process.env.MAESTRO_TOOLBUDGET_MARKERDIR || os.tmpdir();
const turnKey = crypto.createHash('sha1')
  .update(String(data.session_id || '') + ':' + turnStart + ':' + (lines[turnStart] || ''))
  .digest('hex').slice(0, 16);
const marker = path.join(markerDir, 'maestro-toolbudget-' + turnKey);
if (fs.existsSync(marker)) process.exit(0);
try { fs.mkdirSync(markerDir, { recursive: true }); fs.writeFileSync(marker, '1'); } catch {}

// Count exploration (non-edit) tool calls that ran before the first edit
// this turn. priorEdit stops the count at the first edit, whether or not
// the triggering edit is already in the transcript.
let explore = 0;
let priorEdit = false;
for (let i = turnStart; i < parsed.length; i++) {
  const e = parsed[i];
  if (!e || e.type !== 'assistant' || !e.message || !Array.isArray(e.message.content)) continue;
  for (const item of e.message.content) {
    if (!item || item.type !== 'tool_use') continue;
    if (EDIT_TOOLS.has(item.name)) { priorEdit = true; break; }
    explore++;
  }
  if (priorEdit) break;
}

const threshold = parseInt(process.env.MAESTRO_TOOLBUDGET_THRESHOLD, 10) || 20;
if (explore > threshold) {
  const row = {
    ts: new Date().toISOString(),
    session_id: data.session_id || null,
    kind: 'toolbudget-advisory',
    explore_calls: explore,
    threshold,
    first_edit_tool: data.tool_name,
    project: data.cwd ? path.basename(data.cwd) : null
  };
  const logPath = process.env.MAESTRO_TOOLBUDGET_LOG
    || path.join(os.homedir(), '.claude', 'maestro-toolbudget.jsonl');
  try {
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.appendFileSync(logPath, JSON.stringify(row) + '\n');
  } catch { /* advisory is best-effort; never disrupt the session */ }
}

process.exit(0);
