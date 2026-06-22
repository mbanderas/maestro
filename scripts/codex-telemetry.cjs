#!/usr/bin/env node
// Maestro Codex token telemetry. Extends gate telemetry to the Codex
// path so overhead is comparable across both CLIs (AGENTS.md S9).
//
// Codex stores one rollout transcript per session at
//   ~/.codex/sessions/YYYY/MM/DD/rollout-<ts>-<uuid>.jsonl
// (discovered on this machine 2026-06-22). Each line is
// {timestamp, type, payload}. Token usage rides on
//   type:"event_msg", payload.type:"token_count",
//   payload.info.total_token_usage  (CUMULATIVE; the last one wins)
// with fields input_tokens (incl. cached), cached_input_tokens,
// output_tokens (incl. reasoning), reasoning_output_tokens, total_tokens.
// session_meta.payload carries id + cwd; turn_context.payload the model;
// response_item with role:"assistant" are the model turns.
//
// Output: appends one JSON line to ~/.claude/maestro-telemetry.jsonl
// (override: MAESTRO_TELEMETRY_FILE) with source:"codex" and the same
// token field names the Claude SessionEnd hook writes, mapped to the
// same semantics (input_tokens = UNCACHED new input; cache_read_tokens =
// cached input; cache_creation_tokens = null, Codex reports no cache-
// write metric). No network, ever; reads only local files.
//
// Codex supports a full plugin lifecycle hook set (SessionStart..Stop, with
// Stop honoring decision:"block") but has NO SessionEnd event. This telemetry
// mirrors the Claude SessionEnd hook, so on Codex it is invoked manually (or
// from a wrapper); the closest per-turn callout is `notify` ("turn-ended"),
// typically already bound to another integration:
//   node scripts/codex-telemetry.cjs <rollout.jsonl>   # append a row
//   node scripts/codex-telemetry.cjs --latest          # newest rollout
//   node scripts/codex-telemetry.cjs <file> --print     # print, no write
//
// .cjs so Node treats it as CommonJS regardless of any "type": "module".

const fs = require('fs');
const os = require('os');
const path = require('path');
const { StringDecoder } = require('string_decoder');

// Mirror the Claude hook's verdict parser so a Maestro S1 verdict line
// emitted under Codex is captured identically (best-effort parity).
const verdictRe = /(?:GATE|Maestro)[:\s·].*?files=\S+\s+concerns=\S+\s*->\s*(single|multi)-agent/;

// Stream a file line-by-line, sync, with bounded memory. Rollouts reach
// hundreds of MB (386MB observed), so the whole file must NOT be slurped
// into one string -- and we cannot slice to the tail either: session_meta
// (id/cwd/model) is at the HEAD while the last cumulative token_count is
// at the END, so both ends matter. A StringDecoder keeps multi-byte UTF-8
// intact across chunk boundaries. Exported and reused by
// hooks/maestro-verify-gate.cjs so the streaming reader has one source of truth.
function forEachLine(file, cb) {
  const fd = fs.openSync(file, 'r');
  try {
    const CHUNK = 1 << 20;
    const buf = Buffer.allocUnsafe(CHUNK);
    const decoder = new StringDecoder('utf8');
    let leftover = '';
    let bytes;
    while ((bytes = fs.readSync(fd, buf, 0, CHUNK, null)) > 0) {
      leftover += decoder.write(buf.subarray(0, bytes));
      let idx;
      while ((idx = leftover.indexOf('\n')) >= 0) {
        cb(leftover.slice(0, idx).replace(/\r$/, ''));
        leftover = leftover.slice(idx + 1);
      }
    }
    leftover += decoder.end();
    if (leftover) cb(leftover.replace(/\r$/, ''));
  } finally { fs.closeSync(fd); }
}

// Parse a Codex rollout file into a telemetry row, or null if it has no
// token accounting (not a usable session transcript).
function parseRollout(file) {
  let meta = null, model = null, lastTotals = null, assistantTurns = 0, verdict = null;
  try {
    forEachLine(file, (line) => {
      if (!line) return;
      let e;
      try { e = JSON.parse(line); } catch { return; }
      if (!e || !e.payload) return;
      const p = e.payload;
      if (e.type === 'session_meta' && !meta) meta = p;
      else if (e.type === 'turn_context' && p.model) model = p.model;
      else if (e.type === 'event_msg' && p.type === 'token_count'
               && p.info && p.info.total_token_usage) {
        lastTotals = p.info.total_token_usage;
      } else if (e.type === 'response_item' && p.role === 'assistant') {
        assistantTurns++;
        // verdict line may sit in assistant text content
        const parts = Array.isArray(p.content) ? p.content : [];
        for (const c of parts) {
          const t = c && (c.text || c.output_text);
          if (typeof t === 'string') { const m = t.match(verdictRe); if (m) verdict = m[1]; }
        }
      }
    });
  } catch { return null; }
  if (!lastTotals) return null;

  const inputTotal = lastTotals.input_tokens || 0;
  const cached = lastTotals.cached_input_tokens || 0;
  return {
    ts: new Date().toISOString(),
    source: 'codex',
    session_id: (meta && meta.id) || null,
    session_ts: (meta && meta.timestamp) || null,
    model: model || null,
    project: meta && meta.cwd ? path.basename(meta.cwd) : null,
    verdict,
    input_tokens: Math.max(0, inputTotal - cached), // uncached, Claude-comparable
    output_tokens: lastTotals.output_tokens || 0,
    reasoning_output_tokens: lastTotals.reasoning_output_tokens || 0,
    cache_read_tokens: cached,
    cache_creation_tokens: null, // Codex reports no cache-write metric
    cache_hit_pct: inputTotal ? Math.round((cached / inputTotal) * 100) : null,
    assistant_turns: assistantTurns,
    total_tokens: lastTotals.total_tokens || 0,
  };
}

function findLatest(sessionsDir) {
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => {
    const p = path.join(d, e.name);
    return e.isDirectory() ? walk(p) : (/^rollout-.*\.jsonl$/.test(e.name) ? [p] : []);
  });
  let files = [];
  try { files = walk(sessionsDir); } catch { return null; }
  return files.length ? files.sort().pop() : null;
}

function telemetryFile() {
  return process.env.MAESTRO_TELEMETRY_FILE
    || path.join(os.homedir(), '.claude', 'maestro-telemetry.jsonl');
}

function main(argv) {
  const args = argv.slice(2);
  const print = args.includes('--print');
  const latest = args.includes('--latest');
  let file = args.find(a => !a.startsWith('--'));
  if (latest && !file) {
    file = findLatest(process.env.CODEX_SESSIONS_DIR || path.join(os.homedir(), '.codex', 'sessions'));
  }
  if (!file) {
    console.error('usage: codex-telemetry.cjs <rollout.jsonl> | --latest [--print]');
    process.exit(2);
  }
  const row = parseRollout(file);
  if (!row) {
    console.error('no token usage found in ' + file);
    process.exit(1);
  }
  if (print) { process.stdout.write(JSON.stringify(row) + '\n'); return; }
  const out = telemetryFile();
  try {
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.appendFileSync(out, JSON.stringify(row) + '\n');
  } catch (e) {
    console.error('failed to write ' + out + ': ' + e.message);
    process.exit(1);
  }
}

module.exports = { parseRollout, findLatest, forEachLine };

if (require.main === module) main(process.argv);
