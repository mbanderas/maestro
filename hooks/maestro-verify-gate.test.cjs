#!/usr/bin/env node
// Tests for maestro-verify-gate.cjs. Zero dependencies.
// Run: node hooks/maestro-verify-gate.test.cjs

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const HOOK = path.join(__dirname, 'maestro-verify-gate.cjs');

// Isolated marker dir so block-once markers never leak between cases or
// host state. Each transcript file is uniquely named, so a marker keyed
// by transcript path is unique per case (except the block-once case,
// which deliberately reuses one transcript).
const STATE = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-gate-state-'));
const TX = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-gate-tx-'));
// Isolated config dir so the persisted `verifyGate` setting (read via
// settings/config.cjs -> XDG_CONFIG_HOME/maestro/config.json) never picks
// up the host's real config.
const CFG = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-gate-cfg-'));
function writeCfg(obj) {
  const dir = path.join(CFG, 'maestro');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify(obj));
}
let n = 0;

function tx(lines) {
  const f = path.join(TX, `tx-${process.pid}-${n++}.jsonl`);
  fs.writeFileSync(f, lines.map(JSON.stringify).join('\n'));
  return f;
}
const edit = { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Edit', input: { file_path: 'x.js' } }] } };
const bash = (command) => ({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Bash', input: { command } }] } });
const say = (text) => ({ type: 'assistant', message: { content: [{ type: 'text', text }] } });

// Codex rollout fixtures: {timestamp,type,payload}. apply_patch = file edit;
// exec_command = shell (command in arguments.cmd); message/role:assistant =
// model turn. The first line (session_meta) is what the format detector peeks.
function codexTx(lines) {
  const f = path.join(TX, `codex-${process.pid}-${n++}.jsonl`);
  fs.writeFileSync(f, lines.map(JSON.stringify).join('\n') + '\n');
  return f;
}
const cxMeta = { timestamp: '2026-06-22T10:00:00.000Z', type: 'session_meta', payload: { id: 'sess-x', cwd: '/tmp/demo' } };
const cxPatch = { timestamp: '2026-06-22T10:00:01.000Z', type: 'response_item', payload: { type: 'custom_tool_call', name: 'apply_patch', input: '*** Begin Patch\n*** Update File: x.js\n@@\n-a\n+b\n*** End Patch' } };
const cxExec = (cmd) => ({ timestamp: '2026-06-22T10:00:02.000Z', type: 'response_item', payload: { type: 'function_call', name: 'exec_command', arguments: JSON.stringify({ cmd, workdir: '/tmp/demo' }) } });
const cxSay = (text) => ({ timestamp: '2026-06-22T10:00:03.000Z', type: 'response_item', payload: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text }] } });

function runHook(payload, env) {
  const base = { ...process.env, XDG_CONFIG_HOME: CFG, MAESTRO_VERIFY_GATE_STATE_DIR: STATE };
  delete base.MAESTRO_VERIFY_GATE; // default unless a test sets it
  return execFileSync(process.execPath, [HOOK], {
    input: typeof payload === 'string' ? payload : JSON.stringify(payload),
    encoding: 'utf8',
    env: { ...base, ...env }
  });
}
function payloadFor(txPath, extra) {
  return { session_id: 'vg-' + path.basename(txPath), transcript_path: txPath, cwd: TX, ...extra };
}
const BLOCK = { MAESTRO_VERIFY_GATE: 'block' }; // default is 'warn'; arm block explicitly
function isBlock(out) {
  try { return JSON.parse(out).decision === 'block'; } catch { return false; }
}
function isWarn(out) {
  try {
    const j = JSON.parse(out);
    return j.hookSpecificOutput && j.hookSpecificOutput.hookEventName === 'Stop'
      && typeof j.hookSpecificOutput.additionalContext === 'string'
      && j.decision !== 'block';
  } catch { return false; }
}

let failures = 0;
function check(name, cond) {
  if (cond) console.log(`  ok    ${name}`);
  else { failures++; console.error(`  FAIL  ${name}`); }
}

console.log('maestro-verify-gate tests');

// 0. DEFAULT (no env) is warn, not block -- safe at global scope.
let f = tx([edit, say('All done, looks good.')]);
let out = runHook(payloadFor(f));
check('default mode is warn, not block', isWarn(out) && !isBlock(out));

// 1. modified + no checker + no honest token, armed block -> BLOCK.
f = tx([edit, say('All done, looks good.')]);
out = runHook(payloadFor(f), BLOCK);
check('armed block: modified + no-check + no-token -> block', isBlock(out));
check('block reason is actionable (names a checker + tokens)',
  /UNVERIFIED|PENDING_REVIEW|FAIL/.test(out) && /test|lint|check/i.test(out));

// 2. modified + checker ran -> ALLOW.
f = tx([edit, bash('npm test'), say('All done.')]);
check('modified + npm test ran -> allow', runHook(payloadFor(f)) === '');
f = tx([edit, bash('node scripts/run-hook-tests.cjs'), say('done')]);
check('modified + repo runner ran -> allow', runHook(payloadFor(f)) === '');

// 3. no modifications -> ALLOW.
f = tx([say('just answering a question'), bash('ls -la')]);
check('no modifications -> allow', runHook(payloadFor(f)) === '');

// 4. honest UNVERIFIED present -> ALLOW.
f = tx([edit, say('UNVERIFIED: no checker configured for this docs-only change.')]);
check('modified + honest UNVERIFIED -> allow', runHook(payloadFor(f)) === '');

// 5. PENDING_REVIEW present -> ALLOW.
f = tx([edit, say('PENDING_REVIEW: touched protected instructions.')]);
check('modified + PENDING_REVIEW -> allow', runHook(payloadFor(f)) === '');

// 6. VERIFIED claim but NO checker ran -> BLOCK (false-verified is the
//    exact S7.3 violation; VERIFIED is NOT in the honest-token allow set).
f = tx([edit, say('VERIFIED everything works.')]);
check('modified + VERIFIED but no checker -> block', isBlock(runHook(payloadFor(f), BLOCK)));

// 7. block-once-then-allow: same transcript+session twice (armed block).
f = tx([edit, say('done')]);
const p = payloadFor(f);
check('first stop -> block', isBlock(runHook(p, BLOCK)));
check('second stop (same session) -> allow (block-once)', runHook(p, BLOCK) === '');

// 8. off-switch MAESTRO_VERIFY_GATE=0 -> ALLOW.
f = tx([edit, say('done')]);
check('MAESTRO_VERIFY_GATE=0 -> allow', runHook(payloadFor(f), { MAESTRO_VERIFY_GATE: '0' }) === '');

// 9. warn mode -> additionalContext, not a block.
f = tx([edit, say('done')]);
out = runHook(payloadFor(f), { MAESTRO_VERIFY_GATE: 'warn' });
check('MAESTRO_VERIFY_GATE=warn -> warns, does not block', isWarn(out) && !isBlock(out));

// 10. stop_hook_active=true -> ALLOW (never re-enter a stop loop).
f = tx([edit, say('done')]);
check('stop_hook_active -> allow', runHook(payloadFor(f, { stop_hook_active: true })) === '');

// 11. bash mutation (redirect) + no checker + no token, armed block -> BLOCK.
f = tx([bash('echo data > out.txt'), say('wrote the file')]);
check('bash mutation + no-check + no-token -> block', isBlock(runHook(payloadFor(f), BLOCK)));

// 11b. read-only commands using 2>/dev/null are NOT mutations -> ALLOW even
//      armed (the redirect target /dev/null writes nothing).
f = tx([bash('git status 2>/dev/null'), bash('ls -la 2>/dev/null'), say('just looking')]);
check('2>/dev/null read-only + no token -> allow (not a mutation)', runHook(payloadFor(f), BLOCK) === '');

// 12. frontier subprocess -> ALLOW (read-only panel/judge/synth, not a loop).
f = tx([edit, say('done')]);
check('frontier subprocess exempt -> allow', runHook(payloadFor(f), { MAESTRO_FRONTIER_RUN_ID: 'run-x' }) === '');

// 13. missing transcript -> ALLOW (cannot assess; fail-open).
check('missing transcript -> allow', runHook({ session_id: 'vg-none', transcript_path: path.join(TX, 'nope.jsonl'), cwd: TX }) === '');

// 14. garbage stdin -> silent exit 0.
check('garbage stdin -> silent', runHook('not json') === '');

// 15. Persisted setting (config.json verifyGate) is read when no env override.
writeCfg({ verifyGate: 'block' });
f = tx([edit, say('done')]);
check('config verifyGate=block -> block (no env)', isBlock(runHook(payloadFor(f))));
writeCfg({ verifyGate: 'off' });
f = tx([edit, say('done')]);
check('config verifyGate=off -> allow (no env)', runHook(payloadFor(f)) === '');
f = tx([edit, say('done')]);
check('env block overrides config off', isBlock(runHook(payloadFor(f), { MAESTRO_VERIFY_GATE: 'block' })));
writeCfg({}); // default -> warn
f = tx([edit, say('done')]);
check('config default -> warn (no env)', isWarn(runHook(payloadFor(f))));

// --- Codex rollout format (detected by content, same 3 signals) ---
// Pre-implementation, the Claude-only parser found nothing in a rollout and
// always allowed; these cases pin the Codex-aware behavior.

// 16. Codex apply_patch modified + no checker + no token, armed block -> BLOCK.
f = codexTx([cxMeta, cxPatch, cxSay('All done, looks good.')]);
check('codex: apply_patch + no-check + no-token (armed) -> block', isBlock(runHook(payloadFor(f), BLOCK)));

// 17. Codex apply_patch + exec_command checker ran -> ALLOW (even armed).
f = codexTx([cxMeta, cxPatch, cxExec('npm test'), cxSay('done')]);
check('codex: apply_patch + npm test ran -> allow', runHook(payloadFor(f), BLOCK) === '');

// 18. Codex apply_patch + honest UNVERIFIED in assistant text -> ALLOW.
f = codexTx([cxMeta, cxPatch, cxSay('UNVERIFIED: no checker configured for this change.')]);
check('codex: apply_patch + honest UNVERIFIED -> allow', runHook(payloadFor(f), BLOCK) === '');

// 19. Codex no modifications (only a read-only shell) -> ALLOW.
f = codexTx([cxMeta, cxExec('ls -la'), cxSay('just looking around')]);
check('codex: no modifications -> allow', runHook(payloadFor(f), BLOCK) === '');

// 20. Codex shell mutation (redirect) + no check + no token, armed -> BLOCK.
f = codexTx([cxMeta, cxExec('echo data > out.txt'), cxSay('wrote the file')]);
check('codex: shell mutation + no-check + no-token (armed) -> block', isBlock(runHook(payloadFor(f), BLOCK)));

// 21. Codex default mode (no env) on a modified rollout -> WARN, not block.
f = codexTx([cxMeta, cxPatch, cxSay('done')]);
out = runHook(payloadFor(f));
check('codex: default mode warns, does not block', isWarn(out) && !isBlock(out));

// 22. Real Codex rollout smoke (skipped when ~/.codex absent): the streaming
//     parser must handle production DATA without crashing; output must be ''
//     or a valid JSON hook response. (Live Codex Stop execution is NOT tested
//     end-to-end -- there is no Codex runtime here.)
const codexDir = process.env.CODEX_SESSIONS_DIR || path.join(os.homedir(), '.codex', 'sessions');
let realRollout = null;
try {
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => {
    const pp = path.join(d, e.name);
    return e.isDirectory() ? walk(pp) : (/^rollout-.*\.jsonl$/.test(e.name) ? [pp] : []);
  });
  const files = walk(codexDir);
  realRollout = files.length ? files.sort().pop() : null;
} catch { realRollout = null; }
if (realRollout) {
  let crashed = false, res = '';
  try { res = runHook({ session_id: 'vg-real-smoke', transcript_path: realRollout, cwd: TX }); } catch { crashed = true; }
  check('codex real rollout: hook runs without crashing', !crashed);
  check('codex real rollout: output is empty or valid JSON',
    res === '' || (() => { try { JSON.parse(res); return true; } catch { return false; } })());
} else {
  console.log('  ok    (skipped) no real Codex rollout under ' + codexDir);
}

try { fs.rmSync(STATE, { recursive: true, force: true }); fs.rmSync(TX, { recursive: true, force: true }); fs.rmSync(CFG, { recursive: true, force: true }); } catch {}

if (failures) { console.error(`${failures} failure(s)`); process.exit(1); }
console.log('all tests passed');
