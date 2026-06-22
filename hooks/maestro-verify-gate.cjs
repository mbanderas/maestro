#!/usr/bin/env node
// Maestro Stop-event verify gate. Enforces AGENTS.md S7.3 structurally.
//
// S7.3 forbids reporting complete until the smallest relevant repo
// checker passes, OR an honest status token names the gap. The prose
// alone decays in long sessions, so this hook makes the floor
// structural: when THIS session modified files but ran no checker AND
// stated no honest status token, the Stop is blocked once with an
// actionable reason. The model then runs the checker (and reports
// VERIFIED) or states UNVERIFIED / PENDING_REVIEW / FAIL with the gap.
//
// VERIFIED is deliberately NOT an honest-token escape: a VERIFIED claim
// is only legitimate when a checker actually ran (which is a separate
// allow path). "VERIFIED" with no checker run is exactly the dishonesty
// S7.3 names ("No checker ran -> the token is UNVERIFIED, never
// VERIFIED") -- so it still blocks.
//
// Mode resolves env > config.json `verifyGate` > default (settings/config.cjs
// readVerify; MAESTRO_VERIFY_GATE / `settings set verify <mode>`):
// - "warn" (default): emit a non-blocking additionalContext nudge when
//   the gate condition holds -- ~free, never forces a continuation turn,
//   safe at global scope where many repos have no checker.
// - "block": block the Stop once when the gate condition holds. Arm this
//   per-repo (e.g. repos with a real test suite) for hard enforcement.
// - "0" / "off": disabled.
//
// Never traps the user: blocks at most ONCE per session (marker file),
// respects `discipline off`, exempts coordinated Frontier subprocesses
// and stop-hook re-entry, requires a stable marker key before it will
// block, and fails open on any error. Allows whenever no files were
// modified, a checker ran, or an honest token is present.
//
// Feedback channel: {"decision":"block","reason":...} is the Stop output
// the harness honors for blocking; warn mode uses
// hookSpecificOutput.additionalContext (additive, non-blocking).
// Payload fields verified against code.claude.com/docs/en/hooks
// (Stop input: session_id, transcript_path, cwd, stop_hook_active;
// output: decision:block + reason, or hookSpecificOutput), 2026-06-11.
//
// Two transcript formats are parsed, detected by CONTENT not path. A Claude
// JSONL transcript ({type:'assistant', message.content[...]}) is the default.
// A Codex rollout ({timestamp,type,payload}; ~/.codex/sessions/.../rollout-
// *.jsonl) is recognized from its first line and streamed via the
// codex-telemetry line reader (rollouts reach hundreds of MB -- never slurp).
// The three signals come out the same: modified = an apply_patch tool-call or
// a shell command (exec_command `.cmd`) matching the mutation pattern;
// checkerRan = a shell command matching the checker pattern; honestToken = an
// assistant turn's text. Codex's Stop hook does NOT guarantee stop_hook_active,
// so the block-once marker (keyed by transcript_path/session_id) is the
// re-entry guard there; Codex Stop honors decision:"block" identically. Codex
// hook fields per developers.openai.com/codex/hooks (session_id,
// transcript_path, cwd, hook_event_name; no SessionEnd event), 2026-06-22.
//
// .cjs so Node treats it as CommonJS regardless of any "type": "module"
// package.json in a parent directory of the install location.
//
// Install: see README "Claude Code: Verify Gate".

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

// Read just the head of the transcript (bounded) and return its first
// non-empty line parsed as JSON, or null. Used only to detect the format --
// it must never slurp a multi-hundred-MB Codex rollout.
function peekFirstJsonLine(file) {
  let fd;
  try {
    fd = fs.openSync(file, 'r');
    const buf = Buffer.allocUnsafe(65536);
    const n = fs.readSync(fd, buf, 0, 65536, 0);
    const head = buf.subarray(0, n).toString('utf8');
    for (const line of head.split(/\r?\n/)) {
      const s = line.trim();
      if (!s) continue;
      try { return JSON.parse(s); } catch { return null; }
    }
  } catch {
    return null;
  } finally {
    if (fd !== undefined) { try { fs.closeSync(fd); } catch {} }
  }
  return null;
}

// A Codex rollout line is {timestamp,type,payload} with a top-level type in
// the Codex set; a Claude transcript line has no such envelope.
const CODEX_ROLLOUT_TYPES = new Set(['session_meta', 'turn_context', 'event_msg', 'response_item']);
function isCodexRollout(first) {
  return !!first && typeof first === 'object'
    && CODEX_ROLLOUT_TYPES.has(first.type) && 'payload' in first;
}

// Fail-safe to 'warn' (surfaces without trapping) if the setting cannot
// be read -- a safety hook must not silently vanish on a config error.
let mode = 'warn';
try { mode = require('../settings/config.cjs').readVerify().mode; } catch {}
if (mode === 'off') process.exit(0);

let data = {};
try { data = JSON.parse(fs.readFileSync(0, 'utf8')); } catch { process.exit(0); }
// Discipline runtime toggle (settings `discipline off`): silence the pack.
if (!require('./maestro-discipline-gate.cjs').disciplineEnabled()) process.exit(0);

// Never re-enter a stop-hook continuation loop.
if (data.stop_hook_active === true) process.exit(0);

// A coordinated, read-only Frontier subprocess (fusion panel/judge/synth)
// is not a session that owes verification -- exempt it, exactly as the
// loop guard does. The engine stamps such children with
// MAESTRO_FRONTIER_RUN_ID / FUSION_DEPTH.
if (process.env.MAESTRO_FRONTIER_RUN_ID
    || parseInt(process.env.FUSION_DEPTH || '0', 10) >= 1) {
  process.exit(0);
}

// A stable key is required to enforce block-once. Without one we cannot
// dedupe, so we must not block (blocking every Stop would trap the user).
const guardKey = data.transcript_path || data.session_id || '';
if (!guardKey) process.exit(0);
const stateDir = process.env.MAESTRO_VERIFY_GATE_STATE_DIR || os.tmpdir();
const marker = path.join(
  stateDir,
  'maestro-verify-gate-' + crypto.createHash('sha1').update(String(guardKey)).digest('hex').slice(0, 16)
);
if (fs.existsSync(marker)) process.exit(0);

const tp = data.transcript_path;
if (!tp || !fs.existsSync(tp)) process.exit(0); // nothing to assess -> allow

// Detect, per the parsed tool calls only (never raw prose), whether this
// session: modified files, ran a checker, and/or stated an honest token.
// Bash mutation patterns mirror maestro-subagent-guard.cjs.
// A redirect to /dev/null writes nothing -- `2>/dev/null`, `>/dev/null`,
// `&>/dev/null` are read-only idioms, so the lookahead excludes them; a
// redirect to any real path still signals a file mutation.
const bashMutRe = /(?<![-=<>])>{1,2}\s*(?!\/dev\/null)[^\s&|<>]|(^|[\s;&|(])(sed\s+(-\S+\s+)*-i|tee\s|mv\s|cp\s|rm\s|mkdir\s|touch\s|git\s+(commit|apply)\b|apply_migration|(npm|pnpm|yarn)\s+(i|install|add)\b)/;
// Checker patterns: the subagent-guard set plus this repo's runners
// (node scripts/run-hook-tests.cjs, direct *.test.cjs, node --test).
// Broad on purpose: a looser checker match means more allows -- the
// conservative direction for a gate that must never trap.
const checkerRe = /(tsc\s+--noEmit|eslint|pytest|jest|vitest|\bgo\s+test\b|\bcargo\s+test\b|npm\s+(?:run\s+)?test|pnpm\s+test|yarn\s+test|ruff\s+check|mypy|prettier\s+--check|biome\s+check|run-hook-tests|node\s+--test|\.test\.(?:c|m)?js\b)/i;
const honestRe = /\b(UNVERIFIED|PENDING_REVIEW|FAIL)\b/; // case-sensitive: doctrine tokens are uppercase

let modified = false, checkerRan = false, honestToken = false;

// Format is detected by CONTENT, not path: a Codex Stop hook hands us the
// rollout file, whose first line is {timestamp,type,payload}. Anything else
// is treated as a Claude JSONL transcript. Detection/parse failures fall
// through to the Claude path, which allows when it finds nothing -- fail-open.
const first = peekFirstJsonLine(tp);
if (isCodexRollout(first)) {
  // Codex rollout: stream it -- rollouts reach hundreds of MB, so never slurp.
  // Reuse the telemetry script's bounded line reader (one source of truth);
  // if it cannot be loaded, fail-open (allow).
  let forEachLine;
  try { ({ forEachLine } = require('../scripts/codex-telemetry.cjs')); } catch {}
  if (typeof forEachLine !== 'function') process.exit(0);
  try {
    forEachLine(tp, (line) => {
      if (!line) return;
      let e;
      try { e = JSON.parse(line); } catch { return; }
      if (!e || e.type !== 'response_item' || !e.payload) return;
      const p = e.payload;
      if (p.type === 'custom_tool_call') {
        // apply_patch is the Codex file-edit tool (mirrors Edit/Write); its
        // input is PATCH TEXT, not a command, so the name alone is the edit
        // signal (scanning patch text for command patterns yields false
        // hits). Other custom tools -- the cloud `exec` JS wrapper -- embed
        // shell in freeform JS; scan that only for a checker, the allow-safe
        // direction (a stray match adds an allow, never a false block).
        if (p.name === 'apply_patch') modified = true;
        else if (typeof p.input === 'string' && checkerRe.test(p.input)) checkerRan = true;
      } else if (p.type === 'function_call') {
        // Shell tool (exec_command / shell / local_shell): the command rides
        // in arguments.cmd (or .command). Apply the SAME regexes as a Claude
        // Bash command. Non-shell calls (update_plan, wait, ...) lack both
        // fields -> skipped.
        let cmd = '';
        try { const a = JSON.parse(p.arguments); if (a) cmd = a.cmd || a.command || ''; } catch {}
        if (typeof cmd === 'string' && cmd) {
          if (bashMutRe.test(cmd)) modified = true;
          if (checkerRe.test(cmd)) checkerRan = true;
        }
      } else if (p.role === 'assistant') {
        // Honest status tokens are the MODEL's own claims -- assistant turns.
        const parts = Array.isArray(p.content) ? p.content : [];
        for (const c of parts) {
          const t = c && (c.text || c.output_text);
          if (typeof t === 'string' && honestRe.test(t)) honestToken = true;
        }
      }
    });
  } catch { process.exit(0); } // stream/parse failure -> fail-open
} else {
  // Claude transcript (unchanged): bounded slurp + tail, then line-parse.
  let txText = '';
  try {
    const buf = fs.readFileSync(tp, 'utf8');
    txText = buf.length > 4000000 ? buf.slice(-4000000) : buf;
  } catch {}
  if (!txText) process.exit(0);
  for (const line of txText.split(/\r?\n/)) {
    let obj;
    try { obj = JSON.parse(line); } catch { continue; }
    if (!obj || obj.type !== 'assistant' || !obj.message || !Array.isArray(obj.message.content)) continue;
    for (const c of obj.message.content) {
      if (!c) continue;
      if (c.type === 'tool_use') {
        if (c.name === 'Edit' || c.name === 'Write' || c.name === 'NotebookEdit') modified = true;
        if (c.name === 'Bash' && c.input && typeof c.input.command === 'string') {
          if (bashMutRe.test(c.input.command)) modified = true;
          if (checkerRe.test(c.input.command)) checkerRan = true;
        }
      } else if (c.type === 'text' && typeof c.text === 'string') {
        if (honestRe.test(c.text)) honestToken = true;
      }
    }
  }
}

// Allow unless: files modified AND no checker ran AND no honest token.
if (!(modified && !checkerRan && !honestToken)) process.exit(0);

const reason = 'Maestro verify-gate (S7.3): this session modified files '
  + 'but ran no type-check/lint/test and stated no honest status token. '
  + 'Run the smallest repo checker (e.g. `npm test`) and report VERIFIED, '
  + 'or if you cannot, state exactly one of UNVERIFIED / PENDING_REVIEW / '
  + 'FAIL with the named gap. Then restate your final report. '
  + '(Disable: MAESTRO_VERIFY_GATE=0.)';

if (mode === 'warn') {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: 'Stop', additionalContext: reason }
  }));
  process.exit(0);
}

// Block mode: write the once-marker first so the model's continuation
// (which Stops again) is not re-blocked, then emit the block.
try { fs.writeFileSync(marker, String(data.session_id || guardKey)); } catch {}
process.stdout.write(JSON.stringify({ decision: 'block', reason }));
process.exit(0);
