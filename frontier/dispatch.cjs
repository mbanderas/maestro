#!/usr/bin/env node
// Maestro Frontier — CLI-spawn + parallel-fanout for panel adapters.
// spawnOne: one adapter invocation -> PanelResponse (never rejects).
// fanOut:   bounded-concurrent map over modelIds -> PanelResponse[].

'use strict';

const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { stripLlmWrapper } = require('./schema.cjs');
const { mapLimit } = require('./semaphore.cjs');

const MAX_BUF = 2 * 1024 * 1024; // 2 MB cap per stream

/** @param {string} p @returns {string} */
function safeReadFile(p) {
  try { return fs.readFileSync(p, 'utf8'); } catch { return ''; }
}

// Residual cmd.exe hazards for a prompt passed as an ARGUMENT on win32.
// Win32 npm shims (codex/gemini, extensionless or explicitly configured as
// .cmd/.bat) cannot be spawned with shell:false (Node
// v18.20+/20.12+/24 throw EINVAL on .cmd/.bat), and
// shell:true concatenates args unescaped (DEP0190). So we wrap them in an
// explicit `cmd.exe /d /v:off /s /c <shim> ...` with shell:false. Node argv
// quoting is not a complete cmd.exe escaping contract for untrusted prose:
// quotes, variable expansion, command separators, redirection, grouping, and
// delayed-expansion syntax can all alter the /c command line. stdin adapters
// (claude, codex) are unaffected; only the promptVia:'arg' shim path (gemini)
// is, so we refuse the full cmd.exe metacharacter class there. Plain prose,
// spaces, and ordinary punctuation still pass.
const CMD_UNSAFE_RE = new RegExp('["%&|<>()^!\\r\\n]');
function unsafeForShellArg(s) {
  return CMD_UNSAFE_RE.test(String(s));
}

// Base arguments are normally static catalog data, but optional model ids and
// third-party adapters may supply them. Unlike prose prompts, these values do
// not need cmd.exe metacharacters; reject them before a Windows shim sees the
// /c command line. This is defense in depth alongside catalog model-id checks.
const CMD_UNSAFE_BASE_ARG_RE = CMD_UNSAFE_RE;
function unsafeForWinShimBaseArg(s) {
  return CMD_UNSAFE_BASE_ARG_RE.test(String(s));
}

// Do not copy the host environment wholesale into model children: it can
// contain unrelated provider credentials, CI tokens, and user secrets. These
// names are the narrow set needed to resolve binaries and normal per-user CLI
// configuration across POSIX and Windows. Adapter.env/envFrom add the
// adapter's declared endpoint and authentication values explicitly.
const CHILD_ENV_ALLOWLIST = Object.freeze([
  'PATH', 'PATHEXT', 'ComSpec', 'SystemRoot', 'SystemDrive', 'WINDIR',
  'HOME', 'USERPROFILE', 'HOMEDRIVE', 'HOMEPATH', 'APPDATA', 'LOCALAPPDATA',
  'XDG_CONFIG_HOME', 'XDG_CACHE_HOME', 'XDG_DATA_HOME',
  'TMPDIR', 'TEMP', 'TMP', 'LANG', 'LC_ALL', 'LC_CTYPE', 'TERM',
]);

function envValue(source, name) {
  if (!source || typeof source !== 'object') return undefined;
  if (typeof source[name] === 'string') return source[name];
  // Windows environment names are case-insensitive, although objects passed
  // to Node can preserve the original casing (for example Path vs PATH).
  if (process.platform === 'win32') {
    const key = Object.keys(source).find(candidate => candidate.toLowerCase() === name.toLowerCase());
    if (key && typeof source[key] === 'string') return source[key];
  }
  return undefined;
}

function buildChildEnv(adapter, envFrom, fusionDepth, hostEnv) {
  const env = {};
  const source = hostEnv || process.env;
  for (const name of CHILD_ENV_ALLOWLIST) {
    const value = envValue(source, name);
    if (value !== undefined) env[name] = value;
  }
  if (adapter && adapter.env && typeof adapter.env === 'object') Object.assign(env, adapter.env);
  if (envFrom && typeof envFrom === 'object') Object.assign(env, envFrom);
  // The recursion guard is dispatcher-owned; adapters cannot override it.
  env.FUSION_DEPTH = String(fusionDepth);
  return env;
}

function classifyStderr(stderr) {
  const text = String(stderr || '').trim().toLowerCase();
  if (!text) return null;
  if (/(?:auth|unauthori[sz]ed|forbidden|credential|api[ _-]?key|token)/.test(text)) {
    return 'authentication failure';
  }
  if (/(?:rate limit|too many requests|quota)/.test(text)) return 'rate-limited';
  if (/(?:(?:unknown|not found|unavailable).{0,40}model|model.{0,40}(?:unknown|not found|unavailable))/.test(text)) {
    return 'model unavailable';
  }
  return 'subprocess error';
}

/**
 * Spawn one adapter process and return a PanelResponse (never rejects).
 * @param {string} prompt
 * @param {object} adapter  — DEFAULTS.adapters[id] shape
 * @param {{ timeoutMs?: number, fusionDepth?: number }} [opts]
 * @returns {Promise<import('./schema.cjs').PanelResponse>}
 */
function spawnOne(prompt, adapter, opts) {
  const timeoutMs   = (opts && opts.timeoutMs  != null) ? opts.timeoutMs  : 180000;
  const fusionDepth = (opts && opts.fusionDepth != null) ? opts.fusionDepth : 1;

  return new Promise((resolve) => {
    const start = Date.now();

    // Guard: missing/invalid adapter
    if (!adapter || typeof adapter !== 'object') {
      return resolve({
        model: '', content: '', ok: false, durationMs: 0, tokensEst: 0,
        error: 'spawn error: adapter is undefined',
      });
    }

    // ---- build invocation ----
    // Node scripts (test stubs) run via process.execPath; win32 npm shims
    // (extensionless or explicit .cmd/.bat) go through an explicit cmd.exe
    // wrapper (see CMD_UNSAFE_RE note); everything else (claude.exe, POSIX
    // bins) spawns directly. shell is always false.
    const isNodeScript = /\.[cm]?js$/i.test(adapter.bin);
    const binExt = path.extname(adapter.bin).toLowerCase();
    const isWinShim = !isNodeScript && process.platform === 'win32' &&
      (!binExt || binExt === '.cmd' || binExt === '.bat');

    // program args: base flags (+ optional output file) (+ optional prompt arg)
    const baseArgs = Array.isArray(adapter.baseArgs) ? adapter.baseArgs : [];
    if (isWinShim && (unsafeForWinShimBaseArg(adapter.bin) || baseArgs.some(unsafeForWinShimBaseArg))) {
      return resolve({
        model: adapter.model, content: '', ok: false,
        durationMs: Date.now() - start, tokensEst: 0,
        error: 'unsafe command path or base argument for win32 shim adapter (contains a cmd.exe metacharacter)',
      });
    }
    const progArgs = [...baseArgs];

    // last-message-file: unique tmp path
    let tmpPath = null;
    if (adapter.output === 'last-message-file') {
      tmpPath = path.join(
        os.tmpdir(),
        'frontier-' + process.pid + '-' + Date.now() + '-' +
          Math.random().toString(36).slice(2) + '.txt'
      );
      progArgs.push('--output-last-message', tmpPath);
    }

    // The output path is generated locally, but TEMP may be configured with
    // cmd.exe metacharacters. It becomes part of the /c command line for a
    // Windows shim, so reject it using the same guard as static flags.
    if (isWinShim && progArgs.some(unsafeForWinShimBaseArg)) {
      return resolve({
        model: adapter.model, content: '', ok: false,
        durationMs: Date.now() - start, tokensEst: 0,
        error: 'unsafe adapter argument for win32 shim (contains a cmd.exe metacharacter)',
      });
    }

    // prompt delivery via arg (stdin path is written after spawn)
    if (adapter.promptVia === 'arg') {
      if (isWinShim && unsafeForShellArg(prompt)) {
        return resolve({
          model: adapter.model, content: '', ok: false,
          durationMs: Date.now() - start, tokensEst: 0,
          error: 'unsafe prompt for win32 arg-path adapter (contains a cmd.exe ' +
            'metacharacter); use a stdin-capable model or remove that character',
        });
      }
      progArgs.push(adapter.promptFlag || '-p', prompt);
    }

    let bin, spawnArgs;
    if (isNodeScript) {
      bin = process.execPath;
      spawnArgs = [adapter.bin, ...progArgs];
    } else if (isWinShim) {
      bin = process.env.ComSpec || 'cmd.exe';
      // Explicitly disable delayed expansion even though ! is rejected above:
      // cmd.exe inherits its mode from the parent otherwise.
      spawnArgs = ['/d', '/v:off', '/s', '/c', adapter.bin, ...progArgs];
    } else {
      bin = adapter.bin;
      spawnArgs = progArgs;
    }

    // envFrom: required auth passthrough read from the HOST env at spawn time
    // — never stored in config or on disk. Shape { CHILD_VAR: 'HOST_VAR' };
    // any missing/empty HOST_VAR fails this member cleanly BEFORE spawn, so a
    // keyless adapter degrades like any other failed panel member instead of
    // dialing the endpoint half-authenticated.
    const envFrom = {};
    if (adapter.envFrom && typeof adapter.envFrom === 'object') {
      const missing = [];
      for (const [dst, src] of Object.entries(adapter.envFrom)) {
        const val = process.env[src];
        if (val === undefined || val === '') missing.push(src);
        else envFrom[dst] = val;
      }
      if (missing.length > 0) {
        return resolve({
          model: adapter.model, content: '', ok: false,
          durationMs: Date.now() - start, tokensEst: 0,
          error: 'missing env: ' + [...new Set(missing)].join(', ') +
            ' (adapter skipped; export it to enable this member)',
        });
      }
    }

    // envPassthrough is catalog-declared optional compatibility forwarding
    // (for example, Codex API key/session location). Missing values are fine:
    // the child may instead use a different configured login mechanism.
    const optionalEnvFrom = {};
    if (adapter.envPassthrough && typeof adapter.envPassthrough === 'object') {
      for (const [dst, src] of Object.entries(adapter.envPassthrough)) {
        const val = envValue(process.env, src);
        if (val !== undefined && val !== '') optionalEnvFrom[dst] = val;
      }
    }

    const env = buildChildEnv(adapter, { ...optionalEnvFrom, ...envFrom }, fusionDepth);

    let child;
    try {
      child = spawn(bin, spawnArgs, { shell: false, env, windowsHide: true });
    } catch (spawnErr) {
      return resolve({
        model: adapter.model, content: '', ok: false,
        durationMs: Date.now() - start, tokensEst: 0,
        error: 'spawn error',
      });
    }

    // stdin delivery
    if (adapter.promptVia !== 'arg') {
      child.stdin.on('error', () => {});
      try { child.stdin.write(prompt); child.stdin.end(); } catch {}
    }

    let stdoutBuf = '';
    let stderrBuf = '';

    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdoutBuf += chunk;
      if (stdoutBuf.length > MAX_BUF) stdoutBuf = stdoutBuf.slice(-MAX_BUF);
    });

    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => {
      stderrBuf += chunk;
      if (stderrBuf.length > MAX_BUF) stderrBuf = stderrBuf.slice(-MAX_BUF);
    });

    // timeout
    let timedOut  = false;
    let killTimer = null;
    const timer = setTimeout(() => {
      timedOut  = true;
      child.kill('SIGTERM');
      killTimer = setTimeout(() => child.kill('SIGKILL'), 2000);
    }, timeoutMs);

    child.on('error', (err) => {
      clearTimeout(timer);
      if (killTimer) clearTimeout(killTimer);
      resolve({
        model: adapter.model, content: '', ok: false,
        durationMs: Date.now() - start, tokensEst: 0,
        error: 'spawn error',
      });
    });

    child.on('close', (code, signal) => {
      clearTimeout(timer);
      if (killTimer) clearTimeout(killTimer);

      // ---- parse stdout -> content (read tmp file BEFORE cleanup) ----
      let content    = '';
      let parseError = null;

      if (adapter.parse === 'claude-json') {
        let parsed;
        try { parsed = JSON.parse(stdoutBuf); } catch {
          parseError = 'claude json parse fail';
        }
        if (!parseError) {
          if (parsed && parsed.is_error) {
            parseError = String(parsed.result || 'is_error');
          } else {
            content = stripLlmWrapper(String((parsed && parsed.result) || '').trim());
          }
        }
      } else if (adapter.parse === 'gemini-json') {
        let parsed;
        try { parsed = JSON.parse(stdoutBuf); } catch {
          parseError = 'gemini json parse fail';
        }
        if (!parseError) {
          content = stripLlmWrapper(String((parsed && parsed.response) || '').trim());
        }
      } else {
        // 'text': prefer last-message-file content, fall back to stdout
        const raw = (adapter.output === 'last-message-file' ? safeReadFile(tmpPath) : '') || stdoutBuf;
        content = stripLlmWrapper(String(raw).trim());
      }

      // tmp-file cleanup (after read)
      if (tmpPath) {
        try { fs.unlinkSync(tmpPath); } catch {}
      }

      const ok = (code === 0) && !timedOut && content.length > 0 && !parseError;
      let error;
      if (!ok) {
        const stderrClass = classifyStderr(stderrBuf);
        error = parseError ||
          (timedOut
            ? 'timeout'
            : ('exit ' + code + (signal ? (' ' + signal) : '') +
               (stderrClass ? ': ' + stderrClass : '')));
      }

      const durationMs = Date.now() - start;
      const tokensEst  = Math.ceil(content.length / 4);
      resolve({
        model: adapter.model, content, ok, durationMs, tokensEst,
        ...(ok ? {} : { error }),
      });
    });
  });
}

/**
 * fanOut — run spawnOne over modelIds bounded by concurrency; order preserved.
 * @param {string} prompt
 * @param {string[]} modelIds
 * @param {{ adapters: object, timeoutMs: number, concurrency: number }} cfg
 * @param {{ fusionDepth?: number, concurrency?: number, onProgress?: function }} [opts]
 * @returns {Promise<import('./schema.cjs').PanelResponse[]>}
 */
async function fanOut(prompt, modelIds, cfg, opts) {
  const fusionDepth  = (opts && opts.fusionDepth  != null) ? opts.fusionDepth  : 1;
  const concurrency  = (opts && opts.concurrency  != null)
    ? opts.concurrency
    : Math.min(modelIds.length, (cfg && cfg.concurrency) || 4);
  const onProgress   = (opts && typeof opts.onProgress === 'function') ? opts.onProgress : null;

  const total = modelIds.length;
  let done = 0;

  const settled = await mapLimit(modelIds, concurrency, (id) => {
    const adapter = cfg && cfg.adapters && cfg.adapters[id];
    // undefined adapter -> spawnOne resolves a failed PanelResponse
    return spawnOne(prompt, adapter, {
      timeoutMs: (cfg && cfg.timeoutMs) || 180000,
      fusionDepth,
    }).then((result) => {
      done++;
      if (onProgress) {
        try {
          onProgress({ phase: 'panel-progress', done, total, model: result.model, ms: result.durationMs });
        } catch (_) {}
      }
      return result;
    });
  });

  return settled.map((s, i) => {
    if (s.ok) return s.value;
    // spawnOne never rejects, but be defensive
    const adapter = cfg && cfg.adapters && cfg.adapters[modelIds[i]];
    return {
      model: adapter ? adapter.model : modelIds[i],
      content: '', ok: false, durationMs: 0, tokensEst: 0,
      error: String(s.error),
    };
  });
}

module.exports = {
  spawnOne,
  fanOut,
  unsafeForShellArg,
  unsafeForWinShimBaseArg,
  buildChildEnv,
  classifyStderr,
};
