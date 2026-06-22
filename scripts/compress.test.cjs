#!/usr/bin/env node
// Tests for scripts/compress.cjs. Zero dependencies.
// Run: node scripts/compress.test.cjs
// E2E cases stub the claude CLI with a node script; compress.cjs runs
// .js/.cjs/.mjs bins through node, so the stubs work on Windows too.

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const SCRIPT = path.join(__dirname, 'compress.cjs');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-compress-test-'));

let failures = 0;
function check(name, cond) {
  if (cond) { console.log(`  ok    ${name}`); }
  else { failures++; console.error(`  FAIL  ${name}`); }
}

console.log('compress tests');

const { validate, isSensitivePath, stripLlmWrapper, shouldCompress, extractNeedles } = require(SCRIPT);

// ---- validator unit tests ----

const ORIGINAL = `# Title

Intro prose with a link to https://example.com/docs and path ./src/app.ts.

## Setup

- install deps
- run \`npm test\`
- check config

\`\`\`js
const x = 1; // keep me
\`\`\`
`;

// 1. Identical input: valid.
let res = validate(ORIGINAL, ORIGINAL);
check('identical -> valid', res.isValid && res.errors.length === 0);

// 2. Dropped heading: error.
res = validate(ORIGINAL, ORIGINAL.replace('## Setup\n', ''));
check('dropped heading -> error', !res.isValid && res.errors.some(e => e.includes('Heading count')));

// 3. Modified code block: error.
res = validate(ORIGINAL, ORIGINAL.replace('const x = 1; // keep me', 'const x = 1;'));
check('modified code block -> error', !res.isValid && res.errors.some(e => e.includes('Code blocks')));

// 4. Lost URL: error.
res = validate(ORIGINAL, ORIGINAL.replace('https://example.com/docs', 'the docs'));
check('lost URL -> error', !res.isValid && res.errors.some(e => e.includes('URL')));

// 5. Bullet shrink >15%: warning only, still valid.
res = validate(ORIGINAL, ORIGINAL.replace('- install deps\n', '').replace('- check config\n', ''));
check('big bullet drop -> warning, valid', res.isValid && res.warnings.some(w => w.includes('Bullet')));

// ---- needle preservation (deterministic, zero model tokens) ----

// One dropped token per class -> ERROR (triggers repair). Each prose
// pair differs only by the needle, so only the needle check can fire.
const NEEDLE_CASES = [
  ['version', 'Ship 1.9.2 now.', 'Ship now.'],
  ['ISO date', 'Due 2026-06-19 sharp.', 'Due sharp.'],
  ['section id', 'See S7.3 rule.', 'See rule.'],
  ['CLI flag', 'Run with --noEmit set.', 'Run set.'],
  ['env var', 'Read MAESTRO_CLAUDE_BIN first.', 'Read first.'],
  ['unit threshold', 'Cap at 400ms max.', 'Cap max.'],
  ['percent threshold', 'Over 60% overlap fails.', 'Over overlap fails.'],
  ['operator threshold', 'Trigger at >=5 files.', 'Trigger at files.'],
  ['file path', 'Edit docs/orchestration.md here.', 'Edit here.'],
  ['bare filename', 'Patch AGENTS.md only.', 'Patch only.'],
  ['inline code', 'Run `npx tsc --noEmit` to check.', 'Run to check.'],
];
for (const [label, orig, comp] of NEEDLE_CASES) {
  const r = validate(orig, comp);
  check(`dropped ${label} -> needle error`, !r.isValid && r.errors.some(e => e.includes('needle')));
}

// Preserved needles, even with prose reworded around them: no error.
check('preserved needles -> no error',
  validate('Run --noEmit at S7.3, cap 400ms, edit AGENTS.md.',
           'Run --noEmit S7.3, cap 400ms, edit AGENTS.md.').errors.length === 0);

// File path is now an ERROR, not a warning (promoted).
check('dropped path -> error not warning',
  validate('Edit scripts/compress.cjs.', 'Edit.').isValid === false);

// Added needles are ignored -- terse output may introduce a token.
check('added needle ignored -> valid',
  validate('Plain text.', 'Plain text with --flag and S7.3.').isValid);

// Operator/comma/space reflow of a threshold is not a dropped needle.
check('threshold comma+space normalized -> no false drop',
  validate('Truncate >50,000 chars; wait <=270s; need >=5; 35% cap.',
           'Truncate >50000 chars; wait <= 270 s; need >= 5; 35 % cap.')
    .errors.every(e => !e.includes('threshold')));

// extractNeedles ignores fenced code + URLs (checked byte-exact / URL
// elsewhere), so a number only inside a fence is not a prose needle.
check('fenced + url content excluded from needles',
  extractNeedles('See https://x.io/v1.2.3 and\n```\nver = 9.9.9\n```\n').get('version').size === 0);

// Corpus FP guard: a realistic terse compression (drop filler words in
// prose, leave code/needles untouched) of the REAL doctrine files must
// raise ZERO needle errors. This is the precision target (~0 FP).
function terseify(text) {
  // Split out inline/fenced code so filler removal never touches it.
  return text.split(/(`[^`\n]+`|```[\s\S]*?```)/)
    .map((seg, i) => i % 2 ? seg
      : seg.replace(/\b(?:the|a|an|just|really|basically|actually|simply|very)\b ?/gi, ''))
    .join('');
}
const REPO_ROOT = path.join(__dirname, '..');
for (const docFile of ['AGENTS.md', 'CLAUDE.md', path.join('docs', 'orchestration.md')]) {
  const p = path.join(REPO_ROOT, docFile);
  if (!fs.existsSync(p)) { check(`doctrine present: ${docFile}`, false); continue; }
  const orig = fs.readFileSync(p, 'utf8');
  const needleErrs = validate(orig, terseify(orig)).errors.filter(e => e.includes('needle'));
  check(`no needle FP on terse ${docFile}`, needleErrs.length === 0);
}

// ---- sensitive-path denylist ----

check('.env sensitive', isSensitivePath('/proj/.env'));
check('.env.local sensitive', isSensitivePath('/proj/.env.local'));
check('secrets.md sensitive', isSensitivePath('/notes/secrets.md'));
check('credentials sensitive', isSensitivePath('/home/u/credentials'));
check('id_rsa sensitive', isSensitivePath('/home/u/id_rsa'));
check('.ssh dir sensitive', isSensitivePath('/home/u/.ssh/notes.md'));
check('.aws dir sensitive', isSensitivePath('/home/u/.aws/config.md'));
check('api-key.md sensitive', isSensitivePath('/notes/api-key.md'));
check('server.pem sensitive', isSensitivePath('/certs/server.pem'));
check('CLAUDE.md not sensitive', !isSensitivePath('/proj/CLAUDE.md'));
check('todo.md not sensitive', !isSensitivePath('/proj/todo.md'));

// ---- shouldCompress boundaries ----

check('md compressible', shouldCompress('/p/notes.md'));
check('txt compressible', shouldCompress('/p/notes.txt'));
check('extensionless compressible', shouldCompress('/p/TODO'));
check('.js refused', !shouldCompress('/p/app.js'));
check('.json refused', !shouldCompress('/p/cfg.json'));
check('.sh refused', !shouldCompress('/p/run.sh'));
check('backup refused', !shouldCompress('/p/notes.original.md'));

// ---- wrapper strip ----

check('outer fence stripped', stripLlmWrapper('```markdown\n# Hi\nBody\n```') === '# Hi\nBody');
check('no fence untouched', stripLlmWrapper('# Hi\nBody') === '# Hi\nBody');
check('inner fence kept', stripLlmWrapper('# Hi\n```js\nx\n```\n').includes('```js'));

// ---- e2e with stubbed claude ----

function writeStub(name, outputFile) {
  const stubPath = path.join(tmp, name);
  fs.writeFileSync(stubPath,
    '#!/usr/bin/env node\n' +
    `process.stdout.write(require('fs').readFileSync(${JSON.stringify(outputFile)}, 'utf8'));\n`);
  fs.chmodSync(stubPath, 0o755);
  return stubPath;
}

function runCompress(file, stub, expectFail) {
  try {
    const out = execFileSync(process.execPath, [SCRIPT, file], {
      encoding: 'utf8',
      env: { ...process.env, MAESTRO_CLAUDE_BIN: stub }
    });
    return { code: 0, out };
  } catch (e) {
    if (!expectFail) throw e;
    return { code: e.status, out: String(e.stdout || '') + String(e.stderr || '') };
  }
}

// 6. Happy path: stub returns valid compressed content.
const GOOD = `# Title

Intro. Link https://example.com/docs path ./src/app.ts.

## Setup

- install deps
- run \`npm test\`
- check config

\`\`\`js
const x = 1; // keep me
\`\`\`
`;
const goodOut = path.join(tmp, 'good-output.md');
fs.writeFileSync(goodOut, GOOD);
const happyFile = path.join(tmp, 'notes.md');
fs.writeFileSync(happyFile, ORIGINAL);
let r = runCompress(happyFile, writeStub('stub-good.cjs', goodOut));
check('happy path exits 0', r.code === 0);
check('file overwritten with compressed', fs.readFileSync(happyFile, 'utf8') === GOOD);
check('backup holds original', fs.readFileSync(path.join(tmp, 'notes.original.md'), 'utf8') === ORIGINAL);

// 7. Backup exists: abort, original untouched.
const abortFile = path.join(tmp, 'abort.md');
fs.writeFileSync(abortFile, ORIGINAL);
fs.writeFileSync(path.join(tmp, 'abort.original.md'), 'old backup');
r = runCompress(abortFile, writeStub('stub-good2.cjs', goodOut), true);
check('backup exists -> nonzero exit', r.code !== 0);
check('backup exists -> original untouched', fs.readFileSync(abortFile, 'utf8') === ORIGINAL);
check('backup exists -> backup untouched', fs.readFileSync(path.join(tmp, 'abort.original.md'), 'utf8') === 'old backup');

// 8. Validation fails after retries: original restored, backup removed.
const badOut = path.join(tmp, 'bad-output.md');
fs.writeFileSync(badOut, '# Title\n\nLost everything.\n');
const failFile = path.join(tmp, 'fail.md');
fs.writeFileSync(failFile, ORIGINAL);
r = runCompress(failFile, writeStub('stub-bad.cjs', badOut), true);
check('persistent invalid -> nonzero exit', r.code !== 0);
check('persistent invalid -> original restored', fs.readFileSync(failFile, 'utf8') === ORIGINAL);
check('persistent invalid -> backup removed', !fs.existsSync(path.join(tmp, 'fail.original.md')));

// 9. Sensitive file refused before any call.
const sens = path.join(tmp, 'secrets.md');
fs.writeFileSync(sens, 'token: abc');
r = runCompress(sens, writeStub('stub-good3.cjs', goodOut), true);
check('sensitive file refused', r.code !== 0 && r.out.toLowerCase().includes('sensitive'));
check('sensitive file untouched', fs.readFileSync(sens, 'utf8') === 'token: abc');

// 10. Wrong extension refused.
const js = path.join(tmp, 'app.js');
fs.writeFileSync(js, 'const a = 1;');
r = runCompress(js, writeStub('stub-good4.cjs', goodOut), true);
check('.js refused at cli', r.code !== 0);

// 11. Missing file: clean error.
r = runCompress(path.join(tmp, 'nope.md'), writeStub('stub-good5.cjs', goodOut), true);
check('missing file -> nonzero exit', r.code !== 0);

fs.rmSync(tmp, { recursive: true, force: true });

if (failures) { console.error(`${failures} failure(s)`); process.exit(1); }
console.log('all tests passed');
