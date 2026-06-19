#!/usr/bin/env node
// Maestro /maestro:compress pipeline. Compresses a natural-language
// memory file (CLAUDE.md, todos, notes) into terse format to cut
// input tokens (AGENTS.md S8: persistent files are token cost).
// Ported from the Caveman compress skill (MIT,
// github.com/JuliusBrussee/caveman), Python+SDK replaced
// with zero-dependency Node + `claude --print` (desktop auth works,
// no npm packages, no API key handling here).
//
// Pipeline: refuse sensitive/oversized/non-prose files -> compress
// via claude -> backup original as <name>.original.md (abort if the
// backup already exists) -> deterministic validation (headings,
// byte-exact code blocks, URLs, and needle preservation -- versions,
// dates, S-ids, CLI flags, env vars, thresholds, file paths, inline
// code -- as errors; bullet/heading-text drift as warnings) -> on
// error, cherry-pick fix via claude, max 2 attempts -> still failing:
// restore original, remove backup, exit 1.
//
// Usage: node scripts/compress.cjs <filepath>
// MAESTRO_CLAUDE_BIN overrides the claude binary (tests stub it).

'use strict';

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const MAX_FILE_SIZE = 500000;
const MAX_RETRIES = 2;

// ---------- boundaries ----------

// Filenames/paths that almost certainly hold secrets. Compression
// ships raw bytes to the Anthropic API -- a third-party boundary --
// so refuse loudly before reading. Rename the file if the heuristic
// is wrong; there is deliberately no override flag.
const SENSITIVE_BASENAME = new RegExp(
  '^(' +
  '\\.env(\\..+)?' +
  '|\\.netrc' +
  '|credentials(\\..+)?' +
  '|secrets?(\\..+)?' +
  '|passwords?(\\..+)?' +
  '|id_(rsa|dsa|ecdsa|ed25519)(\\.pub)?' +
  '|authorized_keys' +
  '|known_hosts' +
  '|.*\\.(pem|key|p12|pfx|crt|cer|jks|keystore|asc|gpg)' +
  ')$', 'i');
const SENSITIVE_DIRS = new Set(['.ssh', '.aws', '.gnupg', '.kube', '.docker']);
const SENSITIVE_TOKENS = ['secret', 'credential', 'password', 'passwd', 'apikey', 'accesskey', 'token', 'privatekey'];

function isSensitivePath(filepath) {
  const name = path.basename(filepath);
  if (SENSITIVE_BASENAME.test(name)) return true;
  const parts = filepath.split(/[/\\]/).map(p => p.toLowerCase());
  if (parts.some(p => SENSITIVE_DIRS.has(p))) return true;
  const lower = name.toLowerCase().replace(/[_\-\s.]/g, '');
  return SENSITIVE_TOKENS.some(t => lower.includes(t));
}

// Only natural-language files. Never code/config; never a backup.
function shouldCompress(filepath) {
  const name = path.basename(filepath);
  if (name.endsWith('.original.md')) return false;
  const ext = path.extname(name).toLowerCase();
  return ext === '.md' || ext === '.txt' || ext === '';
}

// ---------- validation (deterministic, zero tokens) ----------

const URL_RE = /https?:\/\/[^\s)]+/g;
const HEADING_RE = /^(#{1,6})\s+(.*)$/gm;
const BULLET_RE = /^\s*[-*+]\s+/gm;
const FENCE_OPEN_RE = /^(\s{0,3})(`{3,}|~{3,})(.*)$/;

// Needle classes: high-signal "NEVER alter" tokens (AGENTS.md S8).
// Tuned for PRECISION over recall -- a false error blocks legitimate
// compression (infinite repair / forced restore), so each class only
// matches forms that are unambiguous in prose. See validate().
const VERSION_RE = /\bv?\d+\.\d+(?:\.\d+)+\b/g;            // 1.9.2, v1.8.2 (>=3 components)
const ISO_DATE_RE = /\b\d{4}-\d{2}-\d{2}\b/g;              // 2026-06-19
const SID_RE = /\bS\d+(?:\.\d+)?\b/g;                      // S8, S7.3, S10
const FLAG_RE = /(?<![\w-])--[A-Za-z][\w-]*/g;             // --noEmit, --quiet, --target
const ENV_CONST_RE = /\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/g; // MAESTRO_CLAUDE_BIN, MAX_RETRIES (underscore required: excludes prose ALL-CAPS like NEVER/ALWAYS/JSON)
const THRESHOLD_RE = /[<>]=?\s?\d[\d,]*(?:\.\d+)?\s?%?|\b\d[\d,]*(?:\.\d+)?\s?(?:ms|s|KB|KiB|MB|GB|LOC)\b|\b\d[\d,]*(?:\.\d+)?\s?%/g; // >=5, 400ms, 35%, 500 LOC, >50,000 (whitespace/commas normalized)
const INLINE_CODE_RE = /`([^`\n]+)`/g;                     // `npm test`, `npx tsc --noEmit`
// File paths PROMOTED from warning to error. Extension-bearing only:
// a bare word/word (e.g. Task/Agent, and/or) has no extension so it
// cannot false-positive; real paths and doc filenames always carry one.
const FILE_PATH_RE = /\b[\w.\-]+(?:[/\\][\w.\-]+)*\.(?:md|cjs|mjs|js|ts|tsx|json|jsonc|txt|ps1|sh|py|ya?ml|toml)\b/gi; // AGENTS.md, docs/orchestration.md, ./src/app.ts

const NEEDLE_CLASSES = [
  ['version', VERSION_RE],
  ['ISO date', ISO_DATE_RE],
  ['section id', SID_RE],
  ['CLI flag', FLAG_RE],
  ['env/const', ENV_CONST_RE],
  ['threshold', THRESHOLD_RE],
  ['file path', FILE_PATH_RE],
  ['inline code', INLINE_CODE_RE],
];

function extractHeadings(text) {
  return [...text.matchAll(HEADING_RE)].map(m => m[1] + ' ' + m[2].trim());
}

// Line-based fenced block extractor (CommonMark closing rule: same
// char, at least as long, nothing else on the line). Unclosed fences
// are skipped -- malformed markdown must not cause false failures.
function extractCodeBlocks(text) {
  const blocks = [];
  const lines = text.split(/\r?\n/);
  let i = 0;
  while (i < lines.length) {
    const m = lines[i].match(FENCE_OPEN_RE);
    if (!m) { i++; continue; }
    const ch = m[2][0];
    const len = m[2].length;
    const block = [lines[i]];
    i++;
    let closed = false;
    while (i < lines.length) {
      const c = lines[i].match(FENCE_OPEN_RE);
      if (c && c[2][0] === ch && c[2].length >= len && c[3].trim() === '') {
        block.push(lines[i]);
        closed = true;
        i++;
        break;
      }
      block.push(lines[i]);
      i++;
    }
    if (closed) blocks.push(block.join('\n'));
  }
  return blocks;
}

function setDiff(a, b) {
  return [...a].filter(x => !b.has(x));
}

// Drop fenced code blocks (already checked byte-exact) and URLs
// (already checked) before needle extraction so neither can produce a
// phantom needle diff. Mirrors extractCodeBlocks: an unclosed fence is
// kept as prose, never silently swallowed.
function stripNonProse(text) {
  const lines = text.split(/\r?\n/);
  const kept = [];
  let i = 0;
  while (i < lines.length) {
    const m = lines[i].match(FENCE_OPEN_RE);
    if (!m) { kept.push(lines[i]); i++; continue; }
    const ch = m[2][0];
    const len = m[2].length;
    const buf = [lines[i]];
    i++;
    let closed = false;
    while (i < lines.length) {
      const c = lines[i].match(FENCE_OPEN_RE);
      buf.push(lines[i]);
      i++;
      if (c && c[2][0] === ch && c[2].length >= len && c[3].trim() === '') { closed = true; break; }
    }
    if (!closed) kept.push(...buf);
  }
  return kept.join('\n').replace(URL_RE, ' ');
}

// Map of needle-class -> Set of high-signal tokens found in prose.
// Deterministic, zero model tokens. Threshold tokens are whitespace-
// normalized so ">= 5" and ">=5" compare equal (operator reflow is not
// a dropped needle).
function extractNeedles(text) {
  const prose = stripNonProse(text);
  const out = new Map();
  for (const [name, re] of NEEDLE_CLASSES) {
    const set = new Set();
    for (const match of prose.matchAll(re)) {
      let tok = (match[1] !== undefined ? match[1] : match[0]).trim();
      if (name === 'threshold') tok = tok.replace(/[\s,]/g, '');
      if (tok) set.add(tok);
    }
    out.set(name, set);
  }
  return out;
}

function validate(orig, comp) {
  const result = { isValid: true, errors: [], warnings: [] };
  const err = m => { result.isValid = false; result.errors.push(m); };
  const warn = m => result.warnings.push(m);

  const h1 = extractHeadings(orig);
  const h2 = extractHeadings(comp);
  if (h1.length !== h2.length) err(`Heading count mismatch: ${h1.length} vs ${h2.length}`);
  else if (h1.join('\n') !== h2.join('\n')) warn('Heading text/order changed');

  const c1 = extractCodeBlocks(orig);
  const c2 = extractCodeBlocks(comp);
  if (c1.length !== c2.length || c1.some((b, i) => b !== c2[i])) {
    err('Code blocks not preserved exactly');
  }

  const u1 = new Set(orig.match(URL_RE) || []);
  const u2 = new Set(comp.match(URL_RE) || []);
  const lost = setDiff(u1, u2);
  const added = setDiff(u2, u1);
  if (lost.length || added.length) err(`URL mismatch: lost=[${lost}] added=[${added}]`);

  // Needle preservation (S8 "NEVER alter"): a load-bearing token in the
  // original that is absent from the compressed output is silent
  // corruption -> ERROR (triggers repair). File paths are included here,
  // promoted from the former warning. Added tokens are ignored (terse
  // output may legitimately introduce one); only LOST needles fail.
  const n1 = extractNeedles(orig);
  const n2 = extractNeedles(comp);
  for (const [name, set1] of n1) {
    const lostN = setDiff(set1, n2.get(name));
    if (lostN.length) err(`Dropped ${name} needle(s): [${lostN.join(', ')}]`);
  }

  const b1 = (orig.match(BULLET_RE) || []).length;
  const b2 = (comp.match(BULLET_RE) || []).length;
  if (b1 > 0 && Math.abs(b1 - b2) / b1 > 0.15) warn(`Bullet count changed too much: ${b1} -> ${b2}`);

  return result;
}

// ---------- claude calls ----------

// Strip an outer ```markdown fence when it wraps the ENTIRE output.
function stripLlmWrapper(text) {
  const m = text.match(/^\s*(`{3,}|~{3,})[^\n]*\n([\s\S]*)\n\1\s*$/);
  return m ? m[2] : text;
}

function callClaude(prompt) {
  const bin = process.env.MAESTRO_CLAUDE_BIN || 'claude';
  // Node-script bins (.js/.cjs/.mjs shims, test stubs) rely on a shebang,
  // which Windows cannot exec directly (EFTYPE) — run them through node.
  const isNodeScript = /\.[cm]?js$/i.test(bin);
  const needsShell = !isNodeScript && process.platform === 'win32' && !path.extname(bin);
  const out = execFileSync(isNodeScript ? process.execPath : bin,
    isNodeScript ? [bin, '--print'] : ['--print'], {
    input: prompt,
    encoding: 'utf8',
    maxBuffer: 4 * MAX_FILE_SIZE,
    shell: needsShell
  });
  // trim() drops the trailing newline markdown files end with; restore it.
  const body = stripLlmWrapper(out.trim());
  return body.endsWith('\n') ? body : body + '\n';
}

function compressPrompt(original) {
  return `Compress this markdown into terse format: drop articles, filler, pleasantries, hedging; fragments OK; short synonyms; technical substance stays.

STRICT RULES:
- Do NOT modify anything inside \`\`\` code blocks
- Do NOT modify anything inside inline backticks
- Preserve ALL URLs exactly
- Preserve ALL headings exactly
- Preserve file paths and commands
- Return ONLY the compressed markdown body — do NOT wrap the entire output in a \`\`\`markdown fence or any other fence. Inner code blocks from the original stay as-is; do not add a new outer fence around the whole file.

Only compress natural language.

TEXT:
${original}
`;
}

function fixPrompt(original, compressed, errors) {
  return `You are fixing a terse-compressed markdown file. Specific validation errors were found.

CRITICAL RULES:
- DO NOT recompress or rephrase the file
- ONLY fix the listed errors — leave everything else exactly as-is
- The ORIGINAL is provided as reference only (to restore missing content)
- Preserve terse style in all untouched sections

ERRORS TO FIX:
${errors.map(e => '- ' + e).join('\n')}

HOW TO FIX:
- Missing URL: find it in ORIGINAL, restore it exactly where it belongs in COMPRESSED
- Code block mismatch: find the exact code block in ORIGINAL, restore it in COMPRESSED
- Heading mismatch: restore the exact heading text from ORIGINAL into COMPRESSED
- Dropped needle (version, ISO date, section id like S7.3, CLI flag, env var, numeric threshold, file path, inline-code token): find the exact token in ORIGINAL and restore it verbatim where it belongs in COMPRESSED — never paraphrase, summarize, or omit a load-bearing token
- Do not touch any section not mentioned in the errors

ORIGINAL (reference only):
${original}

COMPRESSED (fix this):
${compressed}

Return ONLY the fixed compressed file. No explanation.
`;
}

// ---------- main ----------

function main() {
  const file = process.argv[2];
  if (!file) {
    console.error('Usage: node scripts/compress.cjs <filepath>');
    process.exit(1);
  }
  const filepath = path.resolve(file);

  if (!fs.existsSync(filepath)) {
    console.error(`File not found: ${filepath}`);
    process.exit(1);
  }
  if (fs.statSync(filepath).size > MAX_FILE_SIZE) {
    console.error(`File too large to compress safely (max 500KB): ${filepath}`);
    process.exit(1);
  }
  if (isSensitivePath(filepath)) {
    console.error(
      `Refusing to compress ${filepath}: filename looks sensitive ` +
      '(credentials, keys, secrets, or known private paths). ' +
      'Compression sends file contents to the Anthropic API. ' +
      'Rename the file if this is a false positive.');
    process.exit(1);
  }
  if (!shouldCompress(filepath)) {
    console.error(`Skipping (not a natural-language file): ${filepath}`);
    process.exit(1);
  }

  const original = fs.readFileSync(filepath, 'utf8');
  const backupPath = path.join(
    path.dirname(filepath),
    path.basename(filepath, path.extname(filepath)) + '.original.md');

  if (fs.existsSync(backupPath)) {
    console.error(
      `Backup already exists: ${backupPath}\n` +
      'It may hold an earlier original. Aborting to prevent data loss; ' +
      'remove or rename the backup to proceed.');
    process.exit(1);
  }

  console.log(`Compressing ${filepath} ...`);
  let compressed = callClaude(compressPrompt(original));

  fs.writeFileSync(backupPath, original);
  fs.writeFileSync(filepath, compressed);

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const result = validate(original, compressed);
    if (result.isValid) {
      for (const w of result.warnings) console.log(`warning: ${w}`);
      const saved = original.length - compressed.length;
      console.log(`Validation passed. ${original.length} -> ${compressed.length} chars (${Math.round(100 * saved / original.length)}% smaller). Backup: ${backupPath}`);
      return;
    }
    console.error(`Validation attempt ${attempt} failed:`);
    for (const e of result.errors) console.error(`  - ${e}`);
    if (attempt === MAX_RETRIES) {
      fs.writeFileSync(filepath, original);
      try { fs.unlinkSync(backupPath); } catch {}
      console.error('Failed after retries — original restored.');
      process.exit(1);
    }
    console.log('Cherry-pick fixing with Claude...');
    compressed = callClaude(fixPrompt(original, compressed, result.errors));
    fs.writeFileSync(filepath, compressed);
  }
}

module.exports = { validate, isSensitivePath, shouldCompress, stripLlmWrapper, extractCodeBlocks, extractHeadings, extractNeedles, stripNonProse };

if (require.main === module) main();
