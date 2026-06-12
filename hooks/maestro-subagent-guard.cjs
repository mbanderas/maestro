#!/usr/bin/env node
// Maestro SubagentStop guard. Enforces AGENTS.md S7.3 structurally.
// - Warn on stop with orphaned background_tasks (all agents)
// - Warn if a file-modifying agent ran no type-check/lint/test
// - Warn if a file-modifying agent's final text carries none of the
//   S7.3 status tokens (VERIFIED / PENDING_REVIEW / UNVERIFIED / FAIL)
//
// Read-only agents (Explore, Plan, or any agent with no file mutation
// in its transcript) are exempt from the verification warning:
// research and audit agents have nothing to verify, and a warning on
// stop extends the agent's turn so its reply to the warning would
// displace the final report the orchestrator is waiting for.
//
// Fires at most once per agent: decision:block re-prompts the
// agent, which stops again and re-triggers this hook. Without the
// once-guard the warning loops and pushes the real report out of the
// final message entirely. The guard is a marker file in the temp dir
// keyed by the agent transcript path -- the block reason is injected
// into the conversation, NOT written to the transcript file, so
// grepping the transcript for our own warning never matches
// (observed live 2026-06-10). The transcript check is kept as a
// secondary guard for harness versions that do persist it.
//
// Feedback channel: {"decision":"block","reason":...} -- the only
// SubagentStop output the harness honors (additionalContext is not
// supported on this event). Blocks the stop exactly once; the agent
// is told to restate its final report so the orchestrator still
// receives it.
//
// .cjs so Node treats it as CommonJS regardless of any "type": "module"
// package.json in a parent directory of the install location.
//
// Install: see README "Claude Code: Verification Hook".

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

let data = {};
try { data = JSON.parse(fs.readFileSync(0, 'utf8')); } catch { process.exit(0); }

// Prefer the subagent's own transcript (agent_transcript_path, since
// Claude Code 2.0.42) over the session transcript.
const txPath = data.agent_transcript_path || data.transcript_path;
let txText = '';
if (txPath && fs.existsSync(txPath)) {
  try {
    const buf = fs.readFileSync(txPath, 'utf8');
    txText = buf.length > 2000000 ? buf.slice(-2000000) : buf;
  } catch {}
}

// Fire once per agent: marker file keyed by transcript path (or
// session id). MAESTRO_GUARD_STATE_DIR overrides the marker dir for
// tests. Transcript check kept as a secondary guard.
const guardKey = data.agent_transcript_path || data.transcript_path || data.session_id || '';
const stateDir = process.env.MAESTRO_GUARD_STATE_DIR || os.tmpdir();
const marker = guardKey
  ? path.join(stateDir, 'maestro-guard-' + crypto.createHash('sha1').update(String(guardKey)).digest('hex').slice(0, 16))
  : null;
if (marker && fs.existsSync(marker)) process.exit(0);
if (txText.includes('Maestro guard:')) process.exit(0);

const warnings = [];

// background_tasks in the SubagentStop payload is machine-wide (all
// sessions), not scoped to this agent (observed live 2026-06-10: a
// fixture-builder agent was warned about unrelated sessions' tasks).
// Only warn when the agent's own transcript shows it spawned
// background work; agents that spawned nothing are exempt.
const spawnRe = /"run_in_background"\s*:\s*true|"name"\s*:\s*"TaskCreate"/;
const bg = Array.isArray(data.background_tasks) ? data.background_tasks : [];
const active = bg.filter(t => t && (t.status === 'running' || t.status === 'pending' || t.status === 'active'));
if (active.length && spawnRe.test(txText)) {
  warnings.push(`${active.length} background task(s) still active. Wait or stop before declaring complete (AGENTS.md S7.3).`);
}

// Read-only exemption: known read-only agent types (agent_type, since
// Claude Code 2.1.69), or no file-mutating activity in the transcript.
// Mutation = Edit/Write/NotebookEdit tool calls, plus Bash mutations:
// redirects, sed -i, tee/mv/cp/rm/mkdir/touch, git commit/apply,
// migrations, package installs. Bash patterns are tested against the
// parsed command strings only, never raw transcript text -- arrows
// (->, =>) and redirect-ish chars in prose must not flip a research
// agent into the writer path (a false nag eats its final report).
const READ_ONLY_TYPES = new Set(['explore', 'plan']);
const agentType = String(data.agent_type || '').toLowerCase();
const toolMutRe = /"name"\s*:\s*"(Edit|Write|NotebookEdit)"/;
const bashMutRe = /(?<![-=<>])>{1,2}\s*[^\s&|<>]|(^|[\s;&|(])(sed\s+(-\S+\s+)*-i|tee\s|mv\s|cp\s|rm\s|mkdir\s|touch\s|git\s+(commit|apply)\b|apply_migration|(npm|pnpm|yarn)\s+(i|install|add)\b)/;
let bashMutation = false;
for (const line of txText.split(/\r?\n/)) {
  let obj;
  try { obj = JSON.parse(line); } catch { continue; }
  if (!obj || obj.type !== 'assistant' || !obj.message || !Array.isArray(obj.message.content)) continue;
  for (const c of obj.message.content) {
    if (c && c.type === 'tool_use' && c.name === 'Bash' && c.input &&
        typeof c.input.command === 'string' && bashMutRe.test(c.input.command)) {
      bashMutation = true;
      break;
    }
  }
  if (bashMutation) break;
}
const readOnly = READ_ONLY_TYPES.has(agentType) || (txText !== '' && !toolMutRe.test(txText) && !bashMutation);

const verifyRe = /(tsc\s+--noEmit|eslint|pytest|jest|vitest|\bgo\s+test\b|\bcargo\s+test\b|npm\s+(?:run\s+)?test|pnpm\s+test|yarn\s+test|ruff\s+check|mypy|prettier\s+--check|biome\s+check)/i;
if (!readOnly && txText && !verifyRe.test(txText)) {
  warnings.push('No type-check/lint/test detected after file modifications. Verify before complete, or state "no checker configured" (AGENTS.md S7.3).');
}

// S7.3 status vocabulary: a file-modifying agent's final text must
// carry one of the four status tokens. Case-sensitive on purpose --
// the doctrine tokens are uppercase, and lowercase "fail"/"verified"
// in prose are not status declarations.
const statusRe = /\b(VERIFIED|PENDING_REVIEW|UNVERIFIED|FAIL)\b/;
if (!readOnly && txText) {
  let finalText = '';
  for (const line of txText.split(/\r?\n/)) {
    let obj;
    try { obj = JSON.parse(line); } catch { continue; }
    if (obj && obj.type === 'assistant' && obj.message && Array.isArray(obj.message.content)) {
      const t = obj.message.content
        .filter(c => c && c.type === 'text' && typeof c.text === 'string')
        .map(c => c.text).join('\n');
      if (t) finalText = t;
    }
  }
  if (finalText && !statusRe.test(finalText)) {
    warnings.push('Final report carries no status token. State exactly one of VERIFIED / PENDING_REVIEW / UNVERIFIED / FAIL, with the named gap if not VERIFIED (AGENTS.md S7.3).');
  }
}

if (warnings.length) {
  if (marker) { try { fs.writeFileSync(marker, String(Date.now())); } catch {} }
  // SubagentStop supports only decision:block + reason as a feedback
  // channel (additionalContext is not honored on this event). Blocking
  // the stop feeds the reason back to the subagent, which addresses it
  // and stops again; the marker file above keeps that second stop silent.
  const payload = {
    decision: 'block',
    reason: 'Maestro guard:\n- ' + warnings.join('\n- ') +
      '\nAfter addressing this, restate your complete final report. Only your last message is returned to the orchestrator.'
  };
  process.stdout.write(JSON.stringify(payload));
}

process.exit(0);
