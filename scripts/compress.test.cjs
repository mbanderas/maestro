#!/usr/bin/env node
// Tests for scripts/compress.cjs. Zero dependencies.
// Run: node scripts/compress.test.cjs
// E2E cases stub the claude CLI with a chmod-755 node script (POSIX;
// CI runs ubuntu).

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

const { validate, isSensitivePath, stripLlmWrapper, shouldCompress } = require(SCRIPT);

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
