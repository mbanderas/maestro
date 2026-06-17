#!/usr/bin/env node
// Maestro terse-mode hook. One file, two events (dispatch on
// hook_event_name):
// - SessionStart: resolve the level (env > config > off), write the
//   flag file, inject the level-filtered ruleset from
//   codex-skills/terse/SKILL.md (single source of truth) as
//   additionalContext.
// - UserPromptSubmit: track level switches (/maestro:terse, /terse,
//   natural-language deactivation) in the flag file and emit a
//   one-line reminder every turn while active -- per-turn
//   reinforcement defeats style drift after context compression
//   (same pattern as maestro-gate-reminder).
//
// Level resolution: MAESTRO_TERSE_LEVEL env var, then terseLevel in
// $XDG_CONFIG_HOME/maestro/config.json (~/.config/maestro fallback,
// %APPDATA%\maestro on Windows), then 'off'. Off by default:
// installing the plugin must not change anyone's output style.
//
// Flag I/O ported from Caveman (MIT): symlink-refusing, O_NOFOLLOW,
// atomic temp+rename, 0600, 64-byte read cap, level whitelist. A
// predictable flag path under ~/.claude is a symlink-attack target;
// never write through one, never inject unvalidated bytes into model
// context.
//
// .cjs so Node treats it as CommonJS regardless of any "type": "module"
// package.json in a parent directory of the install location.

const fs = require('fs');
const os = require('os');
const path = require('path');

const LEVELS = ['lite', 'full', 'ultra'];
const MAX_FLAG_BYTES = 64;

const claudeDir = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
const flagPath = path.join(claudeDir, '.maestro-terse');

function configDir() {
  if (process.env.XDG_CONFIG_HOME) return path.join(process.env.XDG_CONFIG_HOME, 'maestro');
  if (process.platform === 'win32') {
    return path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'maestro');
  }
  return path.join(os.homedir(), '.config', 'maestro');
}

function defaultLevel() {
  const env = String(process.env.MAESTRO_TERSE_LEVEL || '').toLowerCase();
  if (env === 'off' || LEVELS.includes(env)) return env;
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(configDir(), 'config.json'), 'utf8'));
    const v = String(cfg.terseLevel || '').toLowerCase();
    if (v === 'off' || LEVELS.includes(v)) return v;
  } catch {}
  return 'off';
}

function safeWriteFlag(level) {
  try {
    const dir = path.dirname(flagPath);
    fs.mkdirSync(dir, { recursive: true });
    try { if (fs.lstatSync(dir).isSymbolicLink()) return; } catch { return; }
    try {
      if (fs.lstatSync(flagPath).isSymbolicLink()) return;
    } catch (e) {
      if (e.code !== 'ENOENT') return;
    }
    const tempPath = path.join(dir, `.maestro-terse.${process.pid}.${Date.now()}`);
    const O_NOFOLLOW = typeof fs.constants.O_NOFOLLOW === 'number' ? fs.constants.O_NOFOLLOW : 0;
    const flags = fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | O_NOFOLLOW;
    let fd;
    try {
      if (O_NOFOLLOW === 0) { try { if (fs.lstatSync(tempPath).isSymbolicLink()) return; } catch {} }
      fd = fs.openSync(tempPath, flags, 0o600);
      fs.writeSync(fd, String(level));
      try { fs.fchmodSync(fd, 0o600); } catch {}
    } finally {
      if (fd !== undefined) fs.closeSync(fd);
    }
    fs.renameSync(tempPath, flagPath);
  } catch {}
}

function readFlag() {
  try {
    let st;
    try { st = fs.lstatSync(flagPath); } catch { return null; }
    if (st.isSymbolicLink() || !st.isFile()) return null;
    if (st.size > MAX_FLAG_BYTES) return null;
    const O_NOFOLLOW = typeof fs.constants.O_NOFOLLOW === 'number' ? fs.constants.O_NOFOLLOW : 0;
    let fd, out;
    try {
      if (O_NOFOLLOW === 0) { try { if (fs.lstatSync(flagPath).isSymbolicLink()) return null; } catch {} }
      fd = fs.openSync(flagPath, fs.constants.O_RDONLY | O_NOFOLLOW);
      const buf = Buffer.alloc(MAX_FLAG_BYTES);
      const n = fs.readSync(fd, buf, 0, MAX_FLAG_BYTES, 0);
      out = buf.slice(0, n).toString('utf8');
    } finally {
      if (fd !== undefined) fs.closeSync(fd);
    }
    const raw = out.trim().toLowerCase();
    return LEVELS.includes(raw) ? raw : null;
  } catch {
    return null;
  }
}

function removeFlag() {
  try { fs.unlinkSync(flagPath); } catch {}
}

function sessionStart() {
  const level = defaultLevel();
  if (level === 'off' || !LEVELS.includes(level)) { removeFlag(); return; }
  safeWriteFlag(level);

  let body = '';
  try {
    const skill = fs.readFileSync(path.join(__dirname, '..', 'codex-skills', 'terse', 'SKILL.md'), 'utf8');
    // Strip frontmatter and maintainer HTML comments, then keep only
    // the active level's intensity row and example lines.
    body = skill
      .replace(/^---[\s\S]*?---\s*/, '')
      .replace(/<!--[\s\S]*?-->\s*/g, '')
      .split('\n')
      .filter(line => {
        const row = line.match(/^\|\s*\*\*(\S+?)\*\*\s*\|/);
        if (row) return row[1] === level;
        const ex = line.match(/^- (\S+?):\s/);
        if (ex) return ex[1] === level;
        return true;
      })
      .join('\n');
  } catch {
    body = 'Respond terse. All technical substance stay. Only fluff die.\n' +
      'Drop articles/filler/pleasantries/hedging. Fragments OK. ' +
      'Code/commits/PRs: write normal. Off: "stop terse" / "normal mode".';
  }

  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'SessionStart',
      additionalContext: 'MAESTRO TERSE ACTIVE — level: ' + level + '\n\n' + body
    }
  }));
}

function promptSubmit(data) {
  const prompt = String(data.prompt || '').trim().toLowerCase();

  if (prompt.startsWith('/maestro:terse') || prompt.startsWith('/terse')) {
    const arg = (prompt.split(/\s+/)[1] || '').toLowerCase();
    if (arg === 'off') {
      removeFlag();
    } else if (LEVELS.includes(arg)) {
      safeWriteFlag(arg);
    } else {
      // Bare invocation: explicit opt-in. Use the configured default,
      // or 'full' when the default is off.
      const d = defaultLevel();
      safeWriteFlag(LEVELS.includes(d) ? d : 'full');
    }
  }

  if (/\b(stop|disable|deactivate|turn off)\b.*\bterse\b/.test(prompt) ||
      /\bterse\b.*\b(stop|disable|off)\b/.test(prompt) ||
      /\bnormal mode\b/.test(prompt)) {
    removeFlag();
  }

  const active = readFlag();
  if (active) {
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'UserPromptSubmit',
        additionalContext: 'MAESTRO TERSE ACTIVE (' + active + '). ' +
          'Drop articles/filler/pleasantries/hedging. Fragments OK. ' +
          'Code/commits/security: write normal.'
      }
    }));
  }
}

let data = {};
try { data = JSON.parse(fs.readFileSync(0, 'utf8')); } catch { process.exit(0); }

if (data.hook_event_name === 'SessionStart') sessionStart();
else if (data.hook_event_name === 'UserPromptSubmit') promptSubmit(data);

process.exit(0);
