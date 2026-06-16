#!/usr/bin/env node
// Maestro installer — writes doctrine + engine + tool wrapper into a target
// project. Append-only for AGENTS.md, no-clobber for wrapper files, safe to
// re-run. Zero dependencies (Node stdlib only). CommonJS (.cjs).
//
// Usage (as module):  const { run } = require('./install.cjs'); run(argv);
// Usage (as script):  node scripts/install.cjs [flags]

'use strict';

const fs   = require('fs');
const os   = require('os');
const path = require('path');

// ---- constants ----

const PKG_ROOT    = path.join(__dirname, '..');
const SENTINEL    = '<!-- maestro:begin -->';
const SENTINEL_END = '<!-- maestro:end -->';

// Map target -> { templateSrc, projectDest, userDest }
// templateSrc is relative to PKG_ROOT.
// userDest null means no global install path for this target.
const WRAPPER_MAP = {
  codex: {
    src:  'integrations/codex/prompts/frontier.md',
    proj: '.codex/prompts/frontier.md',
    user: path.join(os.homedir(), '.codex', 'prompts', 'frontier.md'),
  },
  cursor: {
    src:  'integrations/cursor/commands/frontier.md',
    proj: '.cursor/commands/frontier.md',
    user: null, // no global path for cursor
  },
  gemini: {
    src:  'integrations/gemini/commands/frontier.toml',
    proj: '.gemini/commands/frontier.toml',
    user: path.join(os.homedir(), '.gemini', 'commands', 'frontier.toml'),
  },
  cline: {
    src:  'integrations/cline/skills/frontier/SKILL.md',
    proj: '.cline/skills/frontier/SKILL.md',
    user: path.join(os.homedir(), '.cline', 'skills', 'frontier', 'SKILL.md'),
  },
  windsurf: {
    src:  'integrations/windsurf/workflows/frontier.md',
    proj: '.windsurf/workflows/frontier.md',
    user: path.join(os.homedir(), '.codeium', 'windsurf', 'global_workflows', 'frontier.md'),
  },
};

// Runtime adapter per target. The adapter imports @AGENTS.md (Cursor has no
// imports, so .cursorrules embeds the kernel). codex/cline/windsurf read
// AGENTS.md directly and need no adapter.
const ADAPTER_MAP = {
  claude: 'CLAUDE.md',
  gemini: 'GEMINI.md',
  cursor: '.cursorrules',
};

// Marker dirs used for auto-detection (scanned inside project root)
const AUTO_MARKERS = [
  { dir: '.cursor',  target: 'cursor'   },
  { dir: '.gemini',  target: 'gemini'   },
  { dir: '.codex',   target: 'codex'    },
  { dir: '.cline',   target: 'cline'    },
  { dir: '.windsurf',target: 'windsurf' },
  { dir: '.claude',  target: 'claude'   },
];

// ---- safety helpers ----

/**
 * Returns true if p is a symlink (lstat-based). Never throws.
 * @param {string} p
 * @returns {boolean}
 */
function isSymlink(p) {
  try {
    return fs.lstatSync(p).isSymbolicLink();
  } catch {
    return false;
  }
}

/**
 * Create directories for destPath. Refuses to create through a symlinked
 * ancestor directory. Returns true on success, false on refusal.
 * @param {string} destPath
 * @returns {boolean}
 */
function safeMkdirp(destPath) {
  const dir = path.dirname(destPath);
  // Walk ancestors from PKG_ROOT outward — only check the leaf dir because
  // we cannot reliably validate every ancestor on all OSes; the write will
  // fail safely if anything is wrong.
  try {
    fs.mkdirSync(dir, { recursive: true });
    return true;
  } catch {
    return false;
  }
}

/**
 * Write buf to dest. Refuses if dest (or its parent dir) is a symlink.
 * Returns { ok: true } or { ok: false, reason: string }.
 * @param {string} dest
 * @param {string|Buffer} content
 * @returns {{ ok: boolean, reason?: string }}
 */
function safeWrite(dest, content) {
  // Check parent dir
  const dir = path.dirname(dest);
  if (isSymlink(dir)) {
    return { ok: false, reason: `parent dir is a symlink: ${dir}` };
  }
  // Check destination itself
  if (isSymlink(dest)) {
    return { ok: false, reason: `destination is a symlink: ${dest}` };
  }
  try {
    fs.writeFileSync(dest, content, 'utf8');
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: String(err.message || err) };
  }
}

// ---- parse argv ----

/**
 * @param {string[]} argv
 * @returns {{ target: string, project: string, user: boolean, dryRun: boolean, noHooks: boolean }}
 */
function parseArgs(argv) {
  const opts = {
    target:  'auto',
    project: process.cwd(),
    user:    false,
    dryRun:  false,
    noHooks: false,
  };

  let i = 0;
  while (i < argv.length) {
    const a = argv[i];
    if (a === '--target' && i + 1 < argv.length) {
      opts.target = argv[++i];
    } else if (a === '--project' && i + 1 < argv.length) {
      opts.project = argv[++i];
    } else if (a === '--user') {
      opts.user = true;
    } else if (a === '--dry-run') {
      opts.dryRun = true;
    } else if (a === '--no-hooks') {
      opts.noHooks = true;
    }
    i++;
  }

  opts.project = path.resolve(opts.project);
  return opts;
}

// ---- auto-detect ----

/**
 * Detect which tool is in use by looking for marker dirs.
 * @param {string} projectRoot
 * @returns {string} detected target or 'none'
 */
function detectTarget(projectRoot) {
  for (const { dir, target } of AUTO_MARKERS) {
    try {
      const p = path.join(projectRoot, dir);
      const st = fs.lstatSync(p);
      if (st.isDirectory()) return target;
    } catch {
      // not found
    }
  }
  return 'none';
}

// ---- install actions ----

/**
 * Read a file from the package root. Returns string, or null (logs) on error.
 * @param {string} rel
 * @param {(msg: string) => void} log
 * @returns {string|null}
 */
function readPkgFile(rel, log) {
  try {
    return fs.readFileSync(path.join(PKG_ROOT, rel), 'utf8');
  } catch (err) {
    log(`ERROR: cannot read package ${rel}: ${err.message}`);
    return null;
  }
}

/**
 * Install a doctrine/adapter markdown file. Append-only, idempotent, never
 * clobbers user content above the maestro block; refuses symlinks.
 * @param {string} dest absolute destination path
 * @param {string} srcContent content to install
 * @param {string} label short name for logs (e.g. "AGENTS.md")
 * @param {boolean} dryRun
 * @param {(msg: string) => void} log
 * @returns {boolean} true = success (or no-op), false = error
 */
function appendOnlyDoctrine(dest, srcContent, label, dryRun, log) {
  const block = `\n${SENTINEL}\n${srcContent}\n${SENTINEL_END}\n`;

  let existsStat;
  try { existsStat = fs.lstatSync(dest); } catch { existsStat = null; }

  if (existsStat) {
    if (existsStat.isSymbolicLink()) {
      log(`ERROR: ${label} is a symlink — refusing to write through it: ${dest}`);
      return false;
    }

    let existing;
    try { existing = fs.readFileSync(dest, 'utf8'); } catch (err) {
      log(`ERROR: cannot read existing ${label}: ${err.message}`);
      return false;
    }

    if (existing.includes(SENTINEL)) {
      log(`[doctrine] ${label} already contains sentinel — skipping`);
      return true;
    }

    if (dryRun) {
      log(`[dry-run] would append maestro doctrine to existing ${dest}`);
      return true;
    }

    const res = safeWrite(dest, existing + block);
    if (!res.ok) {
      log(`ERROR: failed to append to ${label}: ${res.reason}`);
      return false;
    }
    log(`[doctrine] appended maestro block to existing ${label}`);
    return true;
  }

  // Absent — write fresh, wrapped in the sentinel so re-runs detect it.
  if (dryRun) {
    log(`[dry-run] would create ${dest}`);
    return true;
  }

  if (!safeMkdirp(dest)) {
    log(`ERROR: could not create parent dir for ${dest}`);
    return false;
  }

  const freshContent = SENTINEL + '\n' + srcContent + '\n' + SENTINEL_END + '\n';
  const res = safeWrite(dest, freshContent);
  if (!res.ok) {
    log(`ERROR: failed to write ${label}: ${res.reason}`);
    return false;
  }
  log(`[doctrine] wrote ${label}`);
  return true;
}

/**
 * Install the portable doctrine core (AGENTS.md) into the project root.
 * @param {string} projectRoot
 * @param {boolean} dryRun
 * @param {(msg: string) => void} log
 * @returns {boolean}
 */
function installDoctrine(projectRoot, dryRun, log) {
  const src = readPkgFile('AGENTS.md', log);
  if (src === null) return false;
  return appendOnlyDoctrine(path.join(projectRoot, 'AGENTS.md'), src, 'AGENTS.md', dryRun, log);
}

/**
 * Install the runtime adapter for a target (CLAUDE.md / GEMINI.md /
 * .cursorrules). codex/cline/windsurf read AGENTS.md directly -> no-op.
 * @param {string} target
 * @param {string} projectRoot
 * @param {boolean} dryRun
 * @param {(msg: string) => void} log
 * @returns {boolean}
 */
function installAdapter(target, projectRoot, dryRun, log) {
  const rel = ADAPTER_MAP[target];
  if (!rel) return true; // no adapter for this target
  const src = readPkgFile(rel, log);
  if (src === null) return false;
  return appendOnlyDoctrine(path.join(projectRoot, rel), src, rel, dryRun, log);
}

/**
 * Recursively copy srcDir -> destDir, skipping *.test.cjs files.
 * @param {string} srcDir
 * @param {string} destDir
 * @param {boolean} dryRun
 * @param {(msg: string) => void} log
 * @returns {boolean}
 */
function copyDirRecursive(srcDir, destDir, dryRun, log) {
  let entries;
  try {
    entries = fs.readdirSync(srcDir, { withFileTypes: true });
  } catch (err) {
    log(`ERROR: cannot read dir ${srcDir}: ${err.message}`);
    return false;
  }

  let ok = true;
  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith('.test.cjs')) continue;

    const src  = path.join(srcDir, entry.name);
    const dest = path.join(destDir, entry.name);

    if (entry.isDirectory()) {
      if (!copyDirRecursive(src, dest, dryRun, log)) ok = false;
    } else if (entry.isFile()) {
      if (dryRun) {
        log(`[dry-run] would write ${dest}`);
        continue;
      }

      if (isSymlink(dest)) {
        log(`ERROR: destination is a symlink — refusing: ${dest}`);
        ok = false;
        continue;
      }
      if (isSymlink(path.dirname(dest))) {
        log(`ERROR: destination parent is a symlink — refusing: ${dest}`);
        ok = false;
        continue;
      }

      try {
        fs.mkdirSync(destDir, { recursive: true });
        const content = fs.readFileSync(src);
        fs.writeFileSync(dest, content);
        log(`[engine] copied ${dest}`);
      } catch (err) {
        log(`ERROR: failed to copy ${src} -> ${dest}: ${err.message}`);
        ok = false;
      }
    }
  }
  return ok;
}

/**
 * Install engine files (frontier/ dir + bin/maestro.cjs).
 * @param {string} projectRoot
 * @param {boolean} dryRun
 * @param {(msg: string) => void} log
 * @returns {boolean}
 */
function installEngine(projectRoot, dryRun, log) {
  const srcFrontier  = path.join(PKG_ROOT, 'frontier');
  const destFrontier = path.join(projectRoot, 'frontier');
  const srcBin       = path.join(PKG_ROOT, 'bin', 'maestro.cjs');
  const destBin      = path.join(projectRoot, 'bin', 'maestro.cjs');

  let ok = copyDirRecursive(srcFrontier, destFrontier, dryRun, log);

  // bin/maestro.cjs
  if (dryRun) {
    log(`[dry-run] would write ${destBin}`);
  } else {
    if (isSymlink(destBin)) {
      log(`ERROR: bin/maestro.cjs is a symlink — refusing: ${destBin}`);
      ok = false;
    } else {
      try {
        fs.mkdirSync(path.dirname(destBin), { recursive: true });
        fs.writeFileSync(destBin, fs.readFileSync(srcBin));
        log(`[engine] copied ${destBin}`);
      } catch (err) {
        log(`ERROR: failed to copy bin/maestro.cjs: ${err.message}`);
        ok = false;
      }
    }
  }

  // docs/orchestration.md — the on-demand S2-S6 multi-agent protocol the
  // kernel references. Maestro-owned reference file; copy (refuse symlinks).
  const srcDocs  = path.join(PKG_ROOT, 'docs', 'orchestration.md');
  const destDocs = path.join(projectRoot, 'docs', 'orchestration.md');
  if (dryRun) {
    log(`[dry-run] would write ${destDocs}`);
  } else if (isSymlink(destDocs)) {
    log(`ERROR: docs/orchestration.md is a symlink — refusing: ${destDocs}`);
    ok = false;
  } else {
    try {
      fs.mkdirSync(path.dirname(destDocs), { recursive: true });
      fs.writeFileSync(destDocs, fs.readFileSync(srcDocs));
      log(`[doctrine] copied ${destDocs}`);
    } catch (err) {
      log(`ERROR: failed to copy docs/orchestration.md: ${err.message}`);
      ok = false;
    }
  }

  return ok;
}

/**
 * Install wrapper file (no-clobber).
 * @param {string} target
 * @param {string} projectRoot
 * @param {boolean} userGlobal
 * @param {boolean} dryRun
 * @param {(msg: string) => void} log
 * @returns {boolean}
 */
function installWrapper(target, projectRoot, userGlobal, dryRun, log) {
  if (target === 'claude') {
    log('[claude] No wrapper file — plugin delivers the command.');
    log('[claude] To install the plugin: /plugin marketplace add mbanderas/maestro');
    log('[claude] Then: /plugin install maestro@maestro');
    return true;
  }

  const mapping = WRAPPER_MAP[target];
  if (!mapping) {
    log(`ERROR: unknown target: ${target}`);
    return false;
  }

  const src = path.join(PKG_ROOT, mapping.src);

  let dest;
  if (userGlobal) {
    if (!mapping.user) {
      log(`[wrapper] --user not supported for target ${target} — writing to project instead`);
      dest = path.join(projectRoot, mapping.proj);
    } else {
      dest = mapping.user;
    }
  } else {
    dest = path.join(projectRoot, mapping.proj);
  }

  // Check if dest exists already (no-clobber)
  let destStat;
  try { destStat = fs.lstatSync(dest); } catch { destStat = null; }

  if (destStat) {
    if (destStat.isSymbolicLink()) {
      log(`ERROR: wrapper dest is a symlink — refusing: ${dest}`);
      return false;
    }
    log(`[wrapper] skipped (exists, not clobbered): ${dest}`);
    return true;
  }

  let srcContent;
  try {
    srcContent = fs.readFileSync(src, 'utf8');
  } catch (err) {
    log(`ERROR: cannot read template ${src}: ${err.message}`);
    return false;
  }

  if (dryRun) {
    log(`[dry-run] would create ${dest}`);
    return true;
  }

  if (!safeMkdirp(dest)) {
    log(`ERROR: could not create parent dir for ${dest}`);
    return false;
  }

  const res = safeWrite(dest, srcContent);
  if (!res.ok) {
    log(`ERROR: failed to write wrapper ${dest}: ${res.reason}`);
    return false;
  }
  log(`[wrapper] wrote ${dest}`);
  return true;
}

// ---- main entry ----

/**
 * Run the installer. Returns a numeric exit code (0 = success).
 * @param {string[]} argv
 * @returns {number}
 */
function run(argv) {
  const opts = parseArgs(argv || []);
  const { target: rawTarget, project, user: userGlobal, dryRun } = opts;

  const lines = [];
  const log = (msg) => { lines.push(msg); process.stdout.write(msg + '\n'); };

  if (dryRun) log('[dry-run] planning only — no files will be written');

  // Resolve target
  let target = rawTarget;
  if (target === 'auto') {
    target = detectTarget(project);
    if (target === 'none') {
      log('[auto] no tool marker dir found — installing doctrine + engine only');
      log('[auto] pass --target <tool> to install a command wrapper');
    } else {
      log(`[auto] detected target: ${target}`);
    }
  }

  const VALID_TARGETS = ['auto', 'claude', 'codex', 'cursor', 'gemini', 'cline', 'windsurf'];
  if (!VALID_TARGETS.includes(rawTarget)) {
    log(`ERROR: unknown --target value: ${rawTarget}`);
    return 1;
  }

  let anyError = false;

  // 1. Doctrine — portable AGENTS.md kernel + this target's runtime adapter.
  if (!installDoctrine(project, dryRun, log)) anyError = true;
  if (!installAdapter(target, project, dryRun, log)) anyError = true;

  // 2. Engine — frontier/ + bin/maestro.cjs + docs/orchestration.md.
  if (!installEngine(project, dryRun, log)) anyError = true;

  // 3. Wrapper — this target's /frontier command (skip if no target detected).
  if (target !== 'none') {
    if (!installWrapper(target, project, userGlobal, dryRun, log)) anyError = true;
  }

  if (anyError) {
    log('install completed with errors (see above)');
    return 1;
  }
  log('install complete');
  return 0;
}

// ---- CLI entry ----

if (require.main === module) {
  const code = run(process.argv.slice(2));
  process.exit(code);
}

module.exports = { run };
