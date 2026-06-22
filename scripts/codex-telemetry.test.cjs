#!/usr/bin/env node
// Tests for codex-telemetry.cjs. Zero dependencies.
// Run: node scripts/codex-telemetry.test.cjs

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const SCRIPT = path.join(__dirname, 'codex-telemetry.cjs');
const mod = require('./codex-telemetry.cjs');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-tel-'));
let n = 0;
function rollout(lines) {
  const f = path.join(TMP, `rollout-${process.pid}-${n++}.jsonl`);
  fs.writeFileSync(f, lines.map(JSON.stringify).join('\n') + '\n');
  return f;
}

// Synthetic Codex rollout: session_meta + turn_context + 2 assistant
// response_items + 2 token_count events (cumulative; the LAST wins) + a
// user item that must NOT count as an assistant turn.
const FIXTURE = rollout([
  { timestamp: '2026-06-01T10:00:00.000Z', type: 'session_meta', payload: { id: 'sess-abc', timestamp: '2026-06-01T10:00:00.000Z', cwd: '/Users/mark/Workspaces/Demo', cli_version: '0.142.0' } },
  { timestamp: '2026-06-01T10:00:01.000Z', type: 'turn_context', payload: { model: 'gpt-5.5', cwd: '/Users/mark/Workspaces/Demo' } },
  { timestamp: '2026-06-01T10:00:02.000Z', type: 'response_item', payload: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'first' }] } },
  { timestamp: '2026-06-01T10:00:03.000Z', type: 'event_msg', payload: { type: 'token_count', info: { total_token_usage: { input_tokens: 1000, cached_input_tokens: 600, output_tokens: 200, reasoning_output_tokens: 50, total_tokens: 1200 } } } },
  { timestamp: '2026-06-01T10:00:04.000Z', type: 'response_item', payload: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'second' }] } },
  { timestamp: '2026-06-01T10:00:05.000Z', type: 'event_msg', payload: { type: 'token_count', info: { total_token_usage: { input_tokens: 2000, cached_input_tokens: 1500, output_tokens: 500, reasoning_output_tokens: 100, total_tokens: 2500 } } } },
  { timestamp: '2026-06-01T10:00:06.000Z', type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'thanks' }] } },
]);

let failures = 0;
function check(name, cond) {
  if (cond) console.log(`  ok    ${name}`);
  else { failures++; console.error(`  FAIL  ${name}`); }
}

console.log('codex-telemetry tests');

// 1. parseRollout extracts the LAST cumulative totals, Claude-comparable.
const row = mod.parseRollout(FIXTURE);
check('source = codex', row.source === 'codex');
check('session_id from session_meta', row.session_id === 'sess-abc');
check('model from turn_context', row.model === 'gpt-5.5');
check('project = basename(cwd)', row.project === 'Demo');
check('input_tokens = uncached (total - cached)', row.input_tokens === 500);
check('output_tokens (includes reasoning)', row.output_tokens === 500);
check('reasoning_output_tokens captured', row.reasoning_output_tokens === 100);
check('cache_read_tokens = cached_input_tokens', row.cache_read_tokens === 1500);
check('cache_creation_tokens = null (codex has no cache-write metric)', row.cache_creation_tokens === null);
check('cache_hit_pct = round(cached/input_total*100)', row.cache_hit_pct === 75);
check('assistant_turns counts only assistant response_items', row.assistant_turns === 2);
check('total_tokens passthrough', row.total_tokens === 2500);
check('row has an ISO ts', typeof row.ts === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(row.ts));

// 2. CLI --print: prints the row, does NOT append to the telemetry file.
const outFile = path.join(TMP, 'tel.jsonl');
let out = execFileSync(process.execPath, [SCRIPT, FIXTURE, '--print'], {
  encoding: 'utf8', env: { ...process.env, MAESTRO_TELEMETRY_FILE: outFile }
});
check('--print emits a parseable row', (() => { try { return JSON.parse(out.trim()).source === 'codex'; } catch { return false; } })());
check('--print does NOT write the telemetry file', !fs.existsSync(outFile));

// 3. CLI append: writes exactly one row to MAESTRO_TELEMETRY_FILE.
execFileSync(process.execPath, [SCRIPT, FIXTURE], {
  encoding: 'utf8', env: { ...process.env, MAESTRO_TELEMETRY_FILE: outFile }
});
const appended = fs.readFileSync(outFile, 'utf8').trim().split('\n').filter(Boolean);
check('append writes one line', appended.length === 1);
check('appended row is source codex', (() => { try { return JSON.parse(appended[0]).source === 'codex'; } catch { return false; } })());

// 4. Malformed / missing file -> parseRollout returns null (no throw).
check('missing file -> null', mod.parseRollout(path.join(TMP, 'nope.jsonl')) === null);
check('file with no token_count -> null', mod.parseRollout(rollout([{ type: 'session_meta', payload: { id: 'x' } }])) === null);

// 5. Smoke against a REAL Codex rollout if present (validates the parser
//    on production data; skipped cleanly when no transcripts exist).
const sessionsDir = process.env.CODEX_SESSIONS_DIR || path.join(os.homedir(), '.codex', 'sessions');
let real = null;
try {
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => {
    const p = path.join(d, e.name);
    return e.isDirectory() ? walk(p) : (/^rollout-.*\.jsonl$/.test(e.name) ? [p] : []);
  });
  const files = walk(sessionsDir);
  real = files.length ? files.sort().pop() : null;
} catch { real = null; }
if (real) {
  const r = mod.parseRollout(real);
  check('real rollout parses to a codex row', r && r.source === 'codex');
  check('real rollout has non-negative output_tokens', r && typeof r.output_tokens === 'number' && r.output_tokens >= 0);
  check('real rollout has assistant_turns >= 0', r && typeof r.assistant_turns === 'number' && r.assistant_turns >= 0);
} else {
  console.log('  ok    (skipped) no real Codex rollout found under ' + sessionsDir);
}

try { fs.rmSync(TMP, { recursive: true, force: true }); } catch {}

if (failures) { console.error(`${failures} failure(s)`); process.exit(1); }
console.log('all tests passed');
