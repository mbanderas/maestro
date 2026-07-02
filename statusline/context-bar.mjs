#!/usr/bin/env node
// Maestro context bar -- Claude Code status line progress bar (cross-platform Node).
// Renders context-window usage: [########------------] 42% 84k/200k . folder
//
// Node port of context-bar.ps1 / context-bar.sh. Same output and hardening,
// but a single ~60ms Node process instead of a per-render powershell.exe cold
// start -- so it never loses the chain host's hard-kill deadline under render
// load (the "disappearing bar" failure the shell versions hit on Windows).
// Disable: create an empty file named .context-bar-disabled next to this
// script, or run the /context-bar slash command. Default is enabled.
//
// Never throws: every read is guarded and degrades to '' or the folder name.

import { readFileSync, openSync, readSync, closeSync, lstatSync, existsSync, statSync, writeSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { join, dirname, basename, resolve } from 'node:path';

const ESC = '\x1b';
const DIM = `${ESC}[90m`;
const RESET = `${ESC}[0m`;
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const IS_WIN = process.platform === 'win32';

// ---------- guarded filesystem reads (refuse symlinks; cap size) ----------

// Returns the file's text only if it is a regular, non-symlink file within the
// size cap -- never follows a reparse point and never reads more than `cap`
// bytes, so a flag/state file can never make the status line echo the bytes of
// a secret it was symlinked at. Returns '' on any miss.
function readGuarded(path, cap) {
  let st;
  try { st = lstatSync(path); } catch { return ''; }
  if (!st.isFile() || st.isSymbolicLink()) return '';
  if (st.size > cap) return '';
  let fd;
  try {
    fd = openSync(path, 'r');
    const buf = Buffer.alloc(Math.min(st.size, cap));
    const n = readSync(fd, buf, 0, buf.length, 0);
    return buf.toString('utf8', 0, n);
  } catch { return ''; }
  finally { if (fd !== undefined) try { closeSync(fd); } catch { /* ignore */ } }
}

function readGuardedJson(path, cap) {
  const text = readGuarded(path, cap);
  if (!text) return null;
  try { return JSON.parse(text); } catch { return null; }
}

// ---------- config dirs ----------

// Frontier state/progress dir -- mirrors frontier/config.cjs configDir().
function configDir() {
  if (process.env.XDG_CONFIG_HOME) return join(process.env.XDG_CONFIG_HOME, 'maestro');
  if (IS_WIN) return join(process.env.APPDATA || join(homedir(), 'AppData', 'Roaming'), 'maestro');
  return join(homedir(), '.config', 'maestro');
}

// Terse flag lives next to Claude Code's config, not Maestro's.
function claudeConfigDir() {
  return process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude');
}

// ---------- workspace scope (mirrors frontier/config.cjs workspaceHash) ----------

function workspaceScope(cwd) {
  if (!cwd) return null;
  let norm = resolve(cwd);
  let last = null;
  while (norm !== last && !existsSync(join(norm, '.git'))) {
    last = norm;
    norm = dirname(norm);
  }
  norm = IS_WIN
    ? norm.replace(/\\/g, '/').toLowerCase().replace(/\/+$/g, '')
    : norm.replace(/\\/g, '/').replace(/\/+$/g, '');
  return 'cc-' + createHash('sha256').update(norm).digest('hex').slice(0, 8);
}

// Resolve a per-workspace scoped state file, falling back to the legacy
// unscoped file ONLY for a non-cc scope -- matches the shell versions: a
// cc-* workspace never reads another workspace's legacy state.
function scopedOrLegacy(cfgDir, ws, name) {
  const scoped = ws ? join(cfgDir, `${name}.${ws}.json`) : null;
  if (scoped && existsSync(scoped)) return scoped;
  if (ws && ws.startsWith('cc-')) return null;
  const legacy = join(cfgDir, `${name}.json`);
  return existsSync(legacy) ? legacy : null;
}

// ---------- badges ----------

// Terse-mode badge. 64-byte read cap, strip to [a-z], whitelist -- never echo
// attacker-controlled bytes.
function terseBadge() {
  const flag = join(claudeConfigDir(), '.maestro-terse');
  const raw = readGuarded(flag, 64);
  if (!raw) return '';
  const mode = raw.toLowerCase().replace(/[^a-z]/g, '');
  if (!['lite', 'full', 'ultra'].includes(mode)) return '';
  return ` ${ESC}[38;5;172m${mode.toUpperCase()}${RESET}`;
}

// Live Frontier run progress -- emits only whitelisted phase words, clamped
// integer counts, a regex-whitelisted model name, and a clamped elapsed-secs
// figure, never raw bytes. Stale files (ts older than 300s) ignored.
function frontierProgress(cfgDir, ws) {
  const path = scopedOrLegacy(cfgDir, ws, 'frontier-progress');
  if (!path) return '';
  const p = readGuardedJson(path, 8192);
  if (!p) return '';
  const phase = String(p.phase || '');
  if (!['panel', 'judge', 'synth', 'single', 'escalate'].includes(phase)) return '';
  const ts = Number.parseInt(p.ts, 10);
  if (!Number.isFinite(ts) || ts <= 0 || Date.now() - ts > 300000) return '';
  let done = Number.parseInt(p.done, 10); if (!Number.isFinite(done)) done = 0;
  let total = Number.parseInt(p.total, 10); if (!Number.isFinite(total)) total = 0;
  done = Math.max(0, Math.min(99, done));
  total = Math.max(0, Math.min(99, total));
  // Optional enrichments; absent or invalid fields degrade to the bare label
  // (old progress files keep rendering exactly as before). The model string is
  // re-validated reader-side with the writer's own whitelist regex.
  const model = typeof p.model === 'string' && /^[a-z0-9.-]{1,24}$/i.test(p.model) ? p.model : '';
  const startTs = Number.parseInt(p.startTs, 10);
  const elapsedMs = Number.isFinite(startTs) && startTs > 0 ? Date.now() - startTs : 0;
  const secs = elapsedMs > 0 && elapsedMs < 86400000 ? `${Math.floor(elapsedMs / 1000)}s` : '';
  let label;
  switch (phase) {
    case 'panel': label = total > 0 ? `⠿ fanning ${done}/${total}` : '⠿ fanning'; break;
    case 'judge': label = '⚖ judging'; break;
    case 'synth': label = '✦ synthesizing'; break;
    case 'escalate': label = '⟳ escalating'; break;
    case 'single': label = '⠿ running'; break;
    default: return '';
  }
  if (phase !== 'panel' && model) label += ` · ${model}`;
  if (secs) label += ` · ${secs}`;
  return ` ${ESC}[38;5;214mƒ${label}${RESET}`;
}

// Frontier badge. Letter tables mirror frontier/config.cjs DEFAULTS; emit only
// whitelisted letters or a clamped count. Presence = on, absence = off.
function frontierBadge(cfgDir, ws) {
  const prog = frontierProgress(cfgDir, ws);
  if (prog) return prog;
  const path = scopedOrLegacy(cfgDir, ws, 'frontier-state');
  if (!path) return '';
  const st = readGuardedJson(path, 8192);
  if (!st) return '';
  const letters = { opus: 'O', 'gpt-5.5': 'C', gemini: 'G' };
  const presets = { 'opus-duo': 'O+O', 'opus-gpt': 'O+C', 'gpt-duo': 'C+C', 'frontier-trio': 'O+C+G' };
  let panel = '';
  switch (String(st.mode)) {
    case 'single':
      panel = letters[String(st.model)] || '';
      break;
    case 'fusion': {
      const preset = String(st.preset);
      if (preset === 'custom') {
        let n = Array.isArray(st.models) ? st.models.length : 0;
        if (n > 9) n = 9;
        if (n >= 1) panel = `✦${n}`;
      } else if (presets[preset]) {
        panel = presets[preset];
      }
      break;
    }
    default:
      return '';
  }
  return ` ${ESC}[38;5;75mƒ${panel}${RESET}`;
}

// ---------- context-window cap + usage ----------

function capForModel(id) {
  if (!id) return 200000;
  const s = String(id).toLowerCase();
  if (s.includes('1m') || s.includes('[1m]')) return 1000000;
  if (s.includes('fable') || s.includes('mythos')) return 1000000;
  if (/opus-4-[678]/.test(s)) return 1000000;
  return 200000;
}

// Last assistant message's token usage. Reads only a bounded tail of the
// transcript (it can be tens of MB) -- the last 80 complete lines, mirroring
// `Get-Content -Tail 80` / `tail -n 80`, scanned newest-first.
function usedTokens(transcript) {
  if (!transcript || !existsSync(transcript)) return 0;
  let size;
  try { size = statSync(transcript).size; } catch { return 0; }
  const TAIL_BYTES = 2 * 1024 * 1024;
  const start = Math.max(0, size - TAIL_BYTES);
  let text;
  let fd;
  try {
    fd = openSync(transcript, 'r');
    const len = size - start;
    const buf = Buffer.alloc(len);
    const n = readSync(fd, buf, 0, len, start);
    text = buf.toString('utf8', 0, n);
  } catch { return 0; }
  finally { if (fd !== undefined) try { closeSync(fd); } catch { /* ignore */ } }
  let lines = text.split('\n');
  if (start > 0) lines.shift();         // drop the partial first line
  lines = lines.filter((l) => l.length > 0).slice(-80);
  for (let i = lines.length - 1; i >= 0; i--) {
    let obj;
    try { obj = JSON.parse(lines[i]); } catch { continue; }
    if (obj.type !== 'assistant') continue;
    const u = obj.message && obj.message.usage;
    if (!u) continue;
    return (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) +
           (u.cache_creation_input_tokens || 0) + (u.output_tokens || 0);
  }
  return 0;
}

function formatTokens(n) {
  if (n >= 1000000) {
    let s = (n / 1000000).toFixed(1).replace(/\.0$/, '');
    return `${s}M`;
  }
  if (n >= 1000) return `${Math.floor(n / 1000 + 0.5)}k`;
  return `${n}`;
}

// ---------- main ----------

function main() {
  let raw = '';
  try { raw = readFileSync(0, 'utf8'); } catch { raw = ''; }
  let ctx = null;
  try { ctx = JSON.parse(raw); } catch { ctx = null; }
  ctx = ctx || {};

  const cwd = (ctx.workspace && ctx.workspace.current_dir) || ctx.cwd || '';
  const folder = cwd ? basename(cwd) : '?';

  const cfgDir = configDir();
  const ws = workspaceScope(cwd);
  const badges = terseBadge() + frontierBadge(cfgDir, ws);

  // Disabled via flag file -> folder name only.
  if (existsSync(join(SCRIPT_DIR, '.context-bar-disabled'))) {
    return `${DIM}${folder}${RESET}${badges}`;
  }

  let cap = 0;
  if (ctx.context_window && Number.parseInt(ctx.context_window.context_window_size, 10) > 0) {
    cap = Number.parseInt(ctx.context_window.context_window_size, 10);
  }
  if (cap <= 0) cap = capForModel(ctx.model && ctx.model.id);

  const used = usedTokens(ctx.transcript_path);

  const pct = Math.min(100, Math.floor((used / cap) * 100));
  const width = 20;
  let filled = Math.floor((used / cap) * width);
  if (filled > width) filled = width;
  if (filled < 0) filled = 0;

  const color = pct < 60 ? `${ESC}[32m` : pct < 85 ? `${ESC}[33m` : `${ESC}[31m`;
  const bar = color + '█'.repeat(filled) + DIM + '░'.repeat(width - filled) + RESET;

  const usedTxt = formatTokens(used);
  const capTxt = formatTokens(cap);

  return `${bar} ${color}${pct}%${RESET} ${DIM}${usedTxt}/${capTxt}${RESET} ${DIM}·${RESET} ${folder}${badges}`;
}

try {
  const out = main();
  if (out) writeSync(1, out);
} catch { /* prime directive: never break the status line */ }
