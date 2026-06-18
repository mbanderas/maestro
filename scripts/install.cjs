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
const crypto = require('crypto');

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
    user: () => path.join(homeDir(), '.codex', 'prompts', 'frontier.md'),
  },
  cursor: {
    src:  'integrations/cursor/commands/frontier.md',
    proj: '.cursor/commands/frontier.md',
    user: null, // no global path for cursor
  },
  gemini: {
    src:  'integrations/gemini/commands/frontier.toml',
    proj: '.gemini/commands/frontier.toml',
    user: () => path.join(homeDir(), '.gemini', 'commands', 'frontier.toml'),
  },
  cline: {
    src:  'integrations/cline/skills/frontier/SKILL.md',
    proj: '.cline/skills/frontier/SKILL.md',
    user: () => path.join(homeDir(), '.cline', 'skills', 'frontier', 'SKILL.md'),
  },
  windsurf: {
    src:  'integrations/windsurf/workflows/frontier.md',
    proj: '.windsurf/workflows/frontier.md',
    user: () => path.join(homeDir(), '.codeium', 'windsurf', 'global_workflows', 'frontier.md'),
  },
};

// Codex skill templates installed alongside the deprecated codex wrapper.
// Codex loads skills from <project>/.agents/skills/<name>/SKILL.md (project)
// or ~/.agents/skills/<name>/SKILL.md (global). Maestro-owned skills are
// refreshed when still managed; user-edited copies are preserved.
const CODEX_SKILLS = [
  { name: 'maestro-frontier', legacy: 'frontier' },
  { name: 'maestro-terse', legacy: 'terse' },
  { name: 'maestro-settings', legacy: 'settings' },
  { name: 'maestro-update', legacy: 'update' },
];

const LEGACY_CODEX_SKILL_TEMPLATES = {
  frontier: `---
name: frontier
description: Maestro Frontier local multi-CLI fusion engine — switch mode, or run a prompt through the panel
---

Drive the **Maestro Frontier** engine — a zero-dependency local multi-CLI fusion
engine (a parallel panel of local CLIs → a judge model's analysis → a grounded
synthesis). It is the same engine the Claude Code plugin ships; here it runs
through the \`maestro\` CLI with \`--scope codex\`.

**This is a typing shortcut, not a prompt hook.** Codex has no automatic
prompt hook, so arming a mode does **not** auto-run the engine on later prompts —
it only persists the mode. To actually fuse a prompt, invoke \`run\` explicitly
(step 3).

Map the user's request to one engine CLI call and run it from the repo root.
Do not edit the engine's state file by hand.

## 1. Switch mode

Persists to \`~/.config/maestro/frontier-state.codex.json\`; default \`off\`.
\`--scope codex\` keeps Codex's armed mode independent from Claude Code, Cline,
Cursor, and Gemini on the same machine:

\`\`\`bash
maestro frontier mode off --scope codex
maestro frontier mode single --model <model> --scope codex
maestro frontier mode fusion --preset <preset> --scope codex
maestro frontier mode fusion --preset custom --models <a,b,c> --scope codex
maestro frontier mode fusion --preset <preset> --judge <model> --synth <model> --scope codex
\`\`\`

Models: \`opus\` (Claude Opus 4.8, needs \`claude\`), \`gpt-5.5\` (needs \`codex\`),
\`gemini\` (needs \`gemini\`). Presets: \`opus-duo\`, \`opus-gpt\`, \`gpt-duo\`,
\`frontier-trio\`, \`custom\`. Judge + synth default to Opus; \`--judge\`/\`--synth\`
override for any preset (e.g. \`--judge opus --synth gpt-5.5\`). \`gpt-duo\` runs
judge + synth on GPT-5.5 — a Codex-only fusion that needs no \`claude\`.

## 2. Show current mode/preset

\`\`\`bash
maestro frontier status --scope codex
\`\`\`

## 3. Run a prompt through the current mode

This is the action that actually fuses, since nothing auto-runs here. Set a
mode first (step 1), then:

\`\`\`bash
maestro frontier run "<prompt>" --scope codex
\`\`\`

- \`off\`: prints a notice, spawns nothing.
- \`single\`: dispatches the one selected CLI, prints its answer.
- \`fusion\`: runs the panel in parallel → judge → synthesizer; prints the final
  answer (a one-line run meta goes to stderr). Report stdout verbatim.

On error the engine prints \`ERROR [<reason>]: <detail>\` to stderr and exits
non-zero — relay the reason.

## Indicator instruction

<!-- INDICATOR INSTRUCTION — apply every turn while this skill is active -->

Before composing your first reply each turn, run:

\`\`\`bash
maestro frontier status --scope codex
\`\`\`

Parse the returned JSON \`mode\` field:

- If \`mode\` is not \`off\`, make the **first line** of your reply exactly:
  \`Maestro Frontier ON (<label>)\`
  where \`<label>\` is formed as follows:
  - single mode → \`single · <model>\` (e.g. \`single · opus\`)
  - fusion mode → \`fusion · <preset>\` (e.g. \`fusion · frontier-trio\`);
    for a custom preset use \`fusion · custom (<model1>, <model2>, ...)\`
- If \`mode\` is \`off\`, output no indicator line.

<!-- END INDICATOR INSTRUCTION -->

## Notes

- Real \`single\`/\`fusion\` runs spawn local CLIs and cost tokens; use small prompts.
  \`off\` is free.
- Each model's CLI must be on \`PATH\`, or point at a specific build with
  \`MAESTRO_CLAUDE_BIN\` / \`MAESTRO_CODEX_BIN\` / \`MAESTRO_GEMINI_BIN\`.
- Requires \`maestro\` on \`PATH\` (installed during Maestro setup). If it is
  missing, install Maestro first.
`,
  terse: `---
name: terse
description: Toggle Maestro terse output level (lite, full, ultra, off) via the settings CLI
---

Toggle the **Maestro terse** output level for this environment. Terse mode
condenses agent replies; levels range from \`off\` (default verbosity) through
\`lite\`, \`full\`, and \`ultra\` (most compressed).

When the user invokes this skill, run the settings CLI to read or change the
terse level. Do not edit settings files by hand.

## Check current terse level

\`\`\`bash
node settings/cli.cjs --help
\`\`\`

Consult the help output for the exact read subcommand, then run it. If
\`settings/cli.cjs\` is not present, run \`maestro --help\` to discover the
correct path.

## Set terse level

\`\`\`bash
node settings/cli.cjs terse <level>
\`\`\`

Valid levels: \`off\` | \`lite\` | \`full\` | \`ultra\`

Examples:

\`\`\`bash
node settings/cli.cjs terse off
node settings/cli.cjs terse lite
node settings/cli.cjs terse full
node settings/cli.cjs terse ultra
\`\`\`

If the CLI rejects an argument or the subcommand name differs, run
\`node settings/cli.cjs --help\` first and follow the printed usage.

## Notes

- The change persists in Maestro's settings store; it applies to subsequent
  agent turns in this project.
- Requires \`node\` on \`PATH\` and Maestro installed in the project root. If
  \`settings/cli.cjs\` is missing, re-run the Maestro installer:
  \`npx github:mbanderas/maestro install --target codex\`
`,
  settings: `---
name: settings
description: View and change Maestro toggles (terse, frontier, context-bar) via the settings CLI
---

View or change **Maestro settings** for this project. The settings CLI manages
the three primary toggles: \`terse\`, \`frontier\`, and \`context-bar\`.

When the user invokes this skill, run the settings CLI from the repo root.
Do not edit settings files by hand.

## Discover available commands

\`\`\`bash
node settings/cli.cjs --help
\`\`\`

If \`settings/cli.cjs\` is not present, run \`maestro --help\` to locate the
correct entry point.

## Common operations

List current settings:

\`\`\`bash
node settings/cli.cjs
\`\`\`

Set a toggle:

\`\`\`bash
node settings/cli.cjs terse <off|lite|full|ultra>
node settings/cli.cjs frontier <off|single|fusion>
node settings/cli.cjs context-bar <on|off>
\`\`\`

If a subcommand name or argument differs from the above, follow the usage
printed by \`--help\` — do not guess flags.

## Notes

- Changes persist in Maestro's settings store and apply to subsequent agent
  turns in this project.
- Requires \`node\` on \`PATH\` and Maestro installed in the project root. If
  \`settings/cli.cjs\` is missing, re-run the installer:
  \`npx github:mbanderas/maestro install --target codex\`
`,
  update: `---
name: update
description: Update Maestro to the latest version by re-running the installer for Codex
---

Update **Maestro** to the latest marketplace code. This re-runs the installer,
which pulls the current release and overwrites the local Maestro files in place.

When the user invokes this skill, run the installer from the repo root:

\`\`\`bash
npx github:mbanderas/maestro install --target codex
\`\`\`

The installer is idempotent — it is safe to re-run against an existing
installation. It will:

- Pull the latest Maestro source from the repository.
- Overwrite skills, hooks, and settings scaffolding with the new versions.
- Leave project-local configuration (state files, secrets) untouched.

## Notes

- Requires \`node\` and \`npx\` on \`PATH\`.
- Run from the project root so the installer targets the correct directory.
- After the installer completes, restart the Codex session (or reload the
  project) so updated skills and hooks take effect.
- If \`npx\` is unavailable, clone \`https://github.com/mbanderas/maestro\`
  manually and follow the repository's install instructions.
`,
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

function homeDir() {
  return process.platform === 'win32'
    ? (process.env.USERPROFILE || os.homedir())
    : (process.env.HOME || os.homedir());
}

function sha256(content) {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

function codexSkillManagedContent(name, srcContent) {
  const body = srcContent.trimEnd() + '\n';
  return `${body}\n<!-- maestro-managed:codex-skill name=${name} sha256=${sha256(body)} -->\n`;
}

function splitCodexSkillMarker(content) {
  const marker = /\n?<!-- maestro-managed:codex-skill name=([^\s]+) sha256=([a-f0-9]+|0000) -->\s*$/i.exec(content);
  if (!marker) return null;
  return {
    name: marker[1],
    hash: marker[2].toLowerCase(),
    body: content.slice(0, marker.index).trimEnd() + '\n',
  };
}

function isManagedCodexSkillContent(content, expectedName, managedBodies) {
  const marker = splitCodexSkillMarker(content);
  if (marker && marker.name === expectedName) {
    return marker.hash === '0000' || marker.hash === sha256(marker.body);
  }
  if (content.includes(`maestro-managed:codex-skill name=${expectedName} sha256=0000`)) {
    return true;
  }
  return managedBodies.some((body) => content.trimEnd() === body.trimEnd());
}

function legacyCodexSkillContent(legacyName, namespacedName) {
  const body = `---\nname: ${legacyName}\ndescription: Legacy Maestro compatibility skill for ${namespacedName}\n---\n\nThis legacy Maestro skill has moved to \`${namespacedName}\`.\n\nUse the \`${namespacedName}\` skill for current Maestro behavior. This compatibility skill is kept only for existing Codex installs that still reference \`${legacyName}\`.\n`;
  return codexSkillManagedContent(legacyName, body);
}

function legacyGenericCodexTemplate(srcContent, legacyName, namespacedName) {
  return srcContent.replace(
    new RegExp(`(^---\\r?\\nname: )${namespacedName}(\\r?\\n)`, 'm'),
    `$1${legacyName}$2`
  );
}

// ---- parse argv ----

/**
 * @param {string[]} argv
 * @returns {{ target: string, project: string, user: boolean, dryRun: boolean, noHooks: boolean, doctrineOnly: boolean, engineOnly: boolean }}
 */
function parseArgs(argv) {
  const opts = {
    target:  'auto',
    project: process.cwd(),
    user:    false,
    dryRun:  false,
    noHooks: false,
    doctrineOnly: false,
    engineOnly: false,
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
    } else if (a === '--doctrine-only') {
      opts.doctrineOnly = true;
    } else if (a === '--engine-only') {
      opts.engineOnly = true;
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
 * Build the canonical maestro doctrine block (markers + normalized body) using
 * the given newline style. Deterministic: the body is normalized to `nl` and
 * trailing blank lines are trimmed, so re-running produces byte-identical
 * output (no perpetual diff). Returns the SENTINEL..SENTINEL_END span only;
 * the caller owns the surrounding newlines.
 * @param {string} srcContent doctrine source
 * @param {string} nl newline style ('\n' or '\r\n')
 * @returns {string}
 */
function buildDoctrineBlock(srcContent, nl) {
  const body = srcContent.replace(/\r\n/g, '\n').replace(/\n+$/, '').replace(/\n/g, nl);
  return `${SENTINEL}${nl}${body}${nl}${SENTINEL_END}`;
}

/**
 * Install a doctrine/adapter markdown file, merge-safe. Never clobbers user
 * content outside the maestro block: if the block is absent it is appended
 * below existing content; if present it is REPLACED in place (refreshes stale
 * doctrine) while preserving everything outside the markers. Idempotent —
 * re-running with identical doctrine is a no-op. Refuses symlinks and aborts
 * (without writing) on an ambiguous/corrupt marker state. Newline style is
 * taken from the destination file.
 * @param {string} dest absolute destination path
 * @param {string} srcContent content to install
 * @param {string} label short name for logs (e.g. "AGENTS.md")
 * @param {boolean} dryRun
 * @param {(msg: string) => void} log
 * @returns {boolean} true = success (or no-op), false = error
 */
function appendOnlyDoctrine(dest, srcContent, label, dryRun, log) {
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

    const nl = existing.includes('\r\n') ? '\r\n' : '\n';
    const beginCount = existing.split(SENTINEL).length - 1;
    const endCount   = existing.split(SENTINEL_END).length - 1;

    if (beginCount > 0) {
      // Block present — replace it in place, preserving content outside.
      if (beginCount > 1 || endCount > 1) {
        log(`ERROR: ${label} has ${beginCount} begin / ${endCount} end maestro markers — refusing to splice an ambiguous block: ${dest}`);
        return false;
      }
      const bi = existing.indexOf(SENTINEL);
      const ei = existing.indexOf(SENTINEL_END);
      if (ei === -1 || ei < bi) {
        log(`ERROR: ${label} has a maestro begin marker without a following end marker — refusing to splice a corrupt block: ${dest}`);
        return false;
      }
      const prefix = existing.slice(0, bi);
      const suffix = existing.slice(ei + SENTINEL_END.length);
      const updated = prefix + buildDoctrineBlock(srcContent, nl) + suffix;

      if (updated === existing) {
        log(`[doctrine] ${label} already up to date — skipping`);
        return true;
      }
      if (dryRun) {
        log(`[dry-run] would refresh maestro block in ${dest}`);
        return true;
      }
      const res = safeWrite(dest, updated);
      if (!res.ok) {
        log(`ERROR: failed to refresh ${label}: ${res.reason}`);
        return false;
      }
      log(`[doctrine] refreshed maestro block in ${label}`);
      return true;
    }

    // Block absent — append below existing user content.
    if (dryRun) {
      log(`[dry-run] would append maestro doctrine to existing ${dest}`);
      return true;
    }
    const res = safeWrite(dest, existing + nl + buildDoctrineBlock(srcContent, nl) + nl);
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

  const res = safeWrite(dest, buildDoctrineBlock(srcContent, '\n') + '\n');
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
 * Install engine files (frontier/ dir + settings/ dir + bin/maestro.cjs).
 * @param {string} projectRoot
 * @param {boolean} dryRun
 * @param {(msg: string) => void} log
 * @returns {boolean}
 */
function installEngine(projectRoot, dryRun, log) {
  const srcFrontier  = path.join(PKG_ROOT, 'frontier');
  const destFrontier = path.join(projectRoot, 'frontier');
  const srcSettings  = path.join(PKG_ROOT, 'settings');
  const destSettings = path.join(projectRoot, 'settings');
  const srcBin       = path.join(PKG_ROOT, 'bin', 'maestro.cjs');
  const destBin      = path.join(projectRoot, 'bin', 'maestro.cjs');

  let ok = copyDirRecursive(srcFrontier, destFrontier, dryRun, log);
  if (!copyDirRecursive(srcSettings, destSettings, dryRun, log)) ok = false;

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

  return ok;
}

/**
 * Install docs/orchestration.md — the on-demand S2-S6 multi-agent protocol the
 * AGENTS.md kernel references. Discipline-side reference (loaded on a
 * multi-agent verdict), not part of the Frontier engine, so it ships with the
 * doctrine half and is skipped by --engine-only. Maestro-owned; copy, refuse
 * symlinks.
 * @param {string} projectRoot
 * @param {boolean} dryRun
 * @param {(msg: string) => void} log
 * @returns {boolean}
 */
function installOrchestrationDoc(projectRoot, dryRun, log) {
  const srcDocs  = path.join(PKG_ROOT, 'docs', 'orchestration.md');
  const destDocs = path.join(projectRoot, 'docs', 'orchestration.md');
  if (dryRun) {
    log(`[dry-run] would write ${destDocs}`);
    return true;
  }
  if (isSymlink(destDocs)) {
    log(`ERROR: docs/orchestration.md is a symlink — refusing: ${destDocs}`);
    return false;
  }
  try {
    fs.mkdirSync(path.dirname(destDocs), { recursive: true });
    fs.writeFileSync(destDocs, fs.readFileSync(srcDocs));
    log(`[doctrine] copied ${destDocs}`);
    return true;
  } catch (err) {
    log(`ERROR: failed to copy docs/orchestration.md: ${err.message}`);
    return false;
  }
}

/**
 * Copy a single package template file to dest, no-clobber. Skips when dest
 * already exists, refuses symlinks, honors dry-run. Reuses safeMkdirp +
 * safeWrite. Shared by wrapper and Codex-skill installs.
 * @param {string} src absolute source path (under PKG_ROOT)
 * @param {string} dest absolute destination path
 * @param {string} label short tag for logs (e.g. "wrapper", "codex-skill")
 * @param {boolean} dryRun
 * @param {(msg: string) => void} log
 * @returns {boolean} true = success (wrote, skipped, or planned), false = error
 */
function installNoClobberFile(src, dest, label, dryRun, log) {
  // Check if dest exists already (no-clobber)
  let destStat;
  try { destStat = fs.lstatSync(dest); } catch { destStat = null; }

  if (destStat) {
    if (destStat.isSymbolicLink()) {
      log(`ERROR: ${label} dest is a symlink — refusing: ${dest}`);
      return false;
    }
    log(`[${label}] skipped (exists, not clobbered): ${dest}`);
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
    log(`ERROR: failed to write ${label} ${dest}: ${res.reason}`);
    return false;
  }
  log(`[${label}] wrote ${dest}`);
  return true;
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
      dest = mapping.user();
    }
  } else {
    dest = path.join(projectRoot, mapping.proj);
  }

  return installNoClobberFile(src, dest, 'wrapper', dryRun, log);
}

/**
 * Install the Codex skill templates alongside the codex wrapper. Maestro-owned
 * skill files refresh in place; user-edited copies are preserved.
 * Project mode -> <project>/.agents/skills/<name>/SKILL.md; --user/global mode
 * -> ~/.agents/skills/<name>/SKILL.md (mirrors installWrapper's dest logic).
 * @param {string} projectRoot
 * @param {boolean} userGlobal
 * @param {boolean} dryRun
 * @param {(msg: string) => void} log
 * @returns {boolean}
 */
function installManagedCodexSkill(src, dest, name, legacyName, dryRun, log) {
  let srcContent;
  try {
    srcContent = fs.readFileSync(src, 'utf8');
  } catch (err) {
    log(`ERROR: cannot read template ${src}: ${err.message}`);
    return false;
  }

  const managedContent = codexSkillManagedContent(name, srcContent);
  const managedBodies = [srcContent, managedContent];

  let destStat;
  try { destStat = fs.lstatSync(dest); } catch { destStat = null; }

  if (destStat) {
    if (destStat.isSymbolicLink()) {
      log(`ERROR: codex-skill dest is a symlink — refusing: ${dest}`);
      return false;
    }

    let existing;
    try { existing = fs.readFileSync(dest, 'utf8'); } catch (err) {
      log(`ERROR: cannot read existing Codex skill ${dest}: ${err.message}`);
      return false;
    }

    if (!isManagedCodexSkillContent(existing, name, managedBodies)) {
      log(`[codex-skill] preserved user-edited Codex skill: ${dest}`);
      log(`[codex-skill] next step: compare with integrations/codex/skills/${name}/SKILL.md and manually merge if desired`);
      return true;
    }

    if (existing === managedContent) {
      log(`[codex-skill] up to date: ${dest}`);
      return true;
    }

    if (dryRun) {
      log(`[dry-run] would refresh managed Codex skill ${dest}`);
      return true;
    }

    const res = safeWrite(dest, managedContent);
    if (!res.ok) {
      log(`ERROR: failed to refresh codex-skill ${dest}: ${res.reason}`);
      return false;
    }
    log(`[codex-skill] refreshed managed Codex skill: ${dest}`);
    return true;
  }

  if (dryRun) {
    log(`[dry-run] would create ${dest}`);
    return true;
  }

  if (!safeMkdirp(dest)) {
    log(`ERROR: could not create parent dir for ${dest}`);
    return false;
  }

  const res = safeWrite(dest, managedContent);
  if (!res.ok) {
    log(`ERROR: failed to write codex-skill ${dest}: ${res.reason}`);
    return false;
  }
  log(`[codex-skill] wrote ${dest}`);
  return true;
}

function migrateLegacyCodexSkill(dest, legacyName, namespacedName, knownTemplate, dryRun, log) {
  let destStat;
  try { destStat = fs.lstatSync(dest); } catch { return true; }

  if (destStat.isSymbolicLink()) {
    log(`ERROR: legacy codex-skill dest is a symlink — refusing: ${dest}`);
    return false;
  }

  let existing;
  try { existing = fs.readFileSync(dest, 'utf8'); } catch (err) {
    log(`ERROR: cannot read legacy Codex skill ${dest}: ${err.message}`);
    return false;
  }

  const shim = legacyCodexSkillContent(legacyName, namespacedName);
  const managedBodies = [
    knownTemplate,
    legacyGenericCodexTemplate(knownTemplate, legacyName, namespacedName),
    LEGACY_CODEX_SKILL_TEMPLATES[legacyName],
    shim,
  ].filter(Boolean);
  if (!isManagedCodexSkillContent(existing, legacyName, managedBodies)) {
    log(`[codex-skill] preserved user-edited legacy Codex skill: ${dest}`);
    log(`[codex-skill] next step: rename or merge it into .agents/skills/${namespacedName}/SKILL.md if you still need custom behavior`);
    return true;
  }

  if (existing === shim) {
    log(`[codex-skill] legacy compatibility up to date: ${dest}`);
    return true;
  }

  if (dryRun) {
    log(`[dry-run] would migrate legacy Codex skill ${dest}`);
    return true;
  }

  const res = safeWrite(dest, shim);
  if (!res.ok) {
    log(`ERROR: failed to migrate legacy codex-skill ${dest}: ${res.reason}`);
    return false;
  }
  log(`[codex-skill] migrated legacy Codex skill to compatibility shim: ${dest}`);
  return true;
}

function installCodexSkills(projectRoot, userGlobal, dryRun, log) {
  const skillsRoot = userGlobal
    ? path.join(homeDir(), '.agents', 'skills')
    : path.join(projectRoot, '.agents', 'skills');

  let ok = true;
  for (const skill of CODEX_SKILLS) {
    const src  = path.join(PKG_ROOT, 'integrations', 'codex', 'skills', skill.name, 'SKILL.md');
    const dest = path.join(skillsRoot, skill.name, 'SKILL.md');
    if (!installManagedCodexSkill(src, dest, skill.name, skill.legacy, dryRun, log)) ok = false;

    let legacyTemplate = '';
    try { legacyTemplate = fs.readFileSync(src, 'utf8'); } catch {}
    const legacyDest = path.join(skillsRoot, skill.legacy, 'SKILL.md');
    if (!migrateLegacyCodexSkill(legacyDest, skill.legacy, skill.name, legacyTemplate, dryRun, log)) ok = false;
  }
  return ok;
}

// ---- main entry ----

/**
 * Run the installer. Returns a numeric exit code (0 = success).
 * @param {string[]} argv
 * @returns {number}
 */
function run(argv) {
  const opts = parseArgs(argv || []);
  const { target: rawTarget, project, user: userGlobal, dryRun, doctrineOnly, engineOnly } = opts;

  const lines = [];
  const log = (msg) => { lines.push(msg); process.stdout.write(msg + '\n'); };

  if (dryRun) log('[dry-run] planning only — no files will be written');

  if (doctrineOnly && engineOnly) {
    log('ERROR: --doctrine-only and --engine-only are mutually exclusive');
    return 1;
  }

  // Doctrine-only — splice just the AGENTS.md kernel (used by sync-maestro.ps1
  // so the marker-splice is the single merge path; no engine/adapter/wrapper).
  if (doctrineOnly) {
    if (!installDoctrine(project, dryRun, log)) {
      log('doctrine sync completed with errors (see above)');
      return 1;
    }
    log('doctrine sync complete');
    return 0;
  }

  // Resolve target
  let target = rawTarget;
  if (target === 'auto') {
    target = detectTarget(project);
    if (target === 'none') {
      log(`[auto] no tool marker dir found — installing ${engineOnly ? 'engine only' : 'doctrine + engine only'}`);
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

  // 1. Doctrine half — portable AGENTS.md kernel + this target's runtime
  //    adapter + the on-demand multi-agent protocol doc. Skipped by
  //    --engine-only (Frontier engine without the discipline layer).
  if (!engineOnly) {
    if (!installDoctrine(project, dryRun, log)) anyError = true;
    if (!installAdapter(target, project, dryRun, log)) anyError = true;
    if (!installOrchestrationDoc(project, dryRun, log)) anyError = true;
  }

  // 2. Engine half — frontier/ + settings/ + bin/maestro.cjs.
  if (!installEngine(project, dryRun, log)) anyError = true;

  // 3. Wrapper — this target's /frontier command (skip if no target detected).
  if (target !== 'none') {
    if (!installWrapper(target, project, userGlobal, dryRun, log)) anyError = true;
  }

  // 3b. Codex skills — the .agents/skills/<name>/SKILL.md set ships alongside
  // the deprecated codex prompt wrapper.
  if (target === 'codex') {
    if (!installCodexSkills(project, userGlobal, dryRun, log)) anyError = true;
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

module.exports = {
  run,
  _test: {
    LEGACY_CODEX_SKILL_TEMPLATES,
  },
};
