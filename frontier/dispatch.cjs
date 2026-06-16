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
// Win32 npm shims (codex/gemini, extensionless) cannot be spawned with
// shell:false (Node v18.20+/20.12+/24 throw EINVAL on .cmd/.bat), and
// shell:true concatenates args unescaped (DEP0190). So we wrap them in an
// explicit `cmd.exe /d /s /c <shim> ...` with shell:false: Node then applies
// its standard argv quoting to every element, so spaces and &|<>() inside the
// quoted prompt are literal to cmd and there is no unescaped concat. What
// Node's C-runtime quoting does NOT reconcile with cmd.exe is the double quote
// and percent (cmd still expands %VAR% on the /c line). stdin adapters
// (claude, codex) are unaffected; only the promptVia:'arg' shim path (gemini)
// is, so we refuse a prompt bearing those residual chars there. Plain prose —
// spaces and most punctuation included — passes.
const CMD_UNSAFE_RE = new RegExp('["%\\r\\n]');
function unsafeForShellArg(s) {
  return CMD_UNSAFE_RE.test(String(s));
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
    // Node scripts (test stubs) run via process.execPath; win32 npm shims go
    // through an explicit cmd.exe wrapper (see CMD_UNSAFE_RE note); everything
    // else (claude.exe, POSIX bins) spawns directly. shell is always false.
    const isNodeScript = /\.[cm]?js$/i.test(adapter.bin);
    const isWinShim    = !isNodeScript && process.platform === 'win32' && !path.extname(adapter.bin);

    // program args: base flags (+ optional output file) (+ optional prompt arg)
    const progArgs = [...(adapter.baseArgs || [])];

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

    // prompt delivery via arg (stdin path is written after spawn)
    if (adapter.promptVia === 'arg') {
      if (isWinShim && unsafeForShellArg(prompt)) {
        return resolve({
          model: adapter.model, content: '', ok: false,
          durationMs: Date.now() - start, tokensEst: 0,
          error: 'unsafe prompt for win32 arg-path adapter (contains a quote, ' +
            'percent, or newline); use a stdin-capable model or remove those characters',
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
      spawnArgs = ['/d', '/s', '/c', adapter.bin, ...progArgs];
    } else {
      bin = adapter.bin;
      spawnArgs = progArgs;
    }

    const env = { ...process.env, FUSION_DEPTH: String(fusionDepth), ...(adapter.env || {}) };

    let child;
    try {
      child = spawn(bin, spawnArgs, { shell: false, env, windowsHide: true });
    } catch (spawnErr) {
      return resolve({
        model: adapter.model, content: '', ok: false,
        durationMs: Date.now() - start, tokensEst: 0,
        error: 'spawn error: ' + spawnErr.message,
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
        error: 'spawn error: ' + err.message,
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
        error = parseError ||
          (timedOut
            ? 'timeout'
            : ('exit ' + code + (signal ? (' ' + signal) : '') +
               (stderrBuf ? ': ' + stderrBuf.slice(0, 500) : '')));
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

module.exports = { spawnOne, fanOut, unsafeForShellArg };
