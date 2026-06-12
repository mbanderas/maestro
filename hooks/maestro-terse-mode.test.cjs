#!/usr/bin/env node
// Tests for maestro-terse-mode.cjs. Zero dependencies.
// Run: node hooks/maestro-terse-mode.test.cjs

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const HOOK = path.join(__dirname, 'maestro-terse-mode.cjs');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-terse-test-'));
const claudeDir = path.join(tmp, 'claude');
const xdgDir = path.join(tmp, 'xdg');
fs.mkdirSync(claudeDir, { recursive: true });
fs.mkdirSync(path.join(xdgDir, 'maestro'), { recursive: true });
const flagPath = path.join(claudeDir, '.maestro-terse');

function runHook(payload, env) {
  return execFileSync(process.execPath, [HOOK], {
    input: typeof payload === 'string' ? payload : JSON.stringify(payload),
    encoding: 'utf8',
    env: {
      ...process.env,
      CLAUDE_CONFIG_DIR: claudeDir,
      XDG_CONFIG_HOME: xdgDir,
      MAESTRO_TERSE_LEVEL: '',
      ...env
    }
  });
}

function setConfig(level) {
  fs.writeFileSync(path.join(xdgDir, 'maestro', 'config.json'),
    JSON.stringify({ terseLevel: level }));
}
function clearConfig() {
  try { fs.unlinkSync(path.join(xdgDir, 'maestro', 'config.json')); } catch {}
}
function clearFlag() {
  try { fs.unlinkSync(flagPath); } catch {}
}
function flag() {
  try { return fs.readFileSync(flagPath, 'utf8').trim(); } catch { return null; }
}

let failures = 0;
function check(name, cond) {
  if (cond) { console.log(`  ok    ${name}`); }
  else { failures++; console.error(`  FAIL  ${name}`); }
}

console.log('maestro-terse-mode tests');

// 1. SessionStart, no config: default off -> silent, no flag.
clearConfig(); clearFlag();
let out = runHook({ hook_event_name: 'SessionStart' });
check('default off -> silent', out === '');
check('default off -> no flag', flag() === null);

// 2. SessionStart with config level ultra: writes flag, injects
// level-filtered ruleset as SessionStart additionalContext.
setConfig('ultra');
out = runHook({ hook_event_name: 'SessionStart' });
check('config ultra -> flag written', flag() === 'ultra');
check('SessionStart valid hook JSON', (() => {
  try { return JSON.parse(out).hookSpecificOutput.hookEventName === 'SessionStart'; }
  catch { return false; }
})());
check('ruleset announces level', out.includes('MAESTRO TERSE ACTIVE') && out.includes('ultra'));
check('ruleset keeps active level row only', out.includes('**ultra**') && !out.includes('**lite**'));
check('Auto-Clarity escape present', out.includes('Auto-Clarity'));
check('code-normal boundary present', out.includes('write normal') || out.includes('Code/commits/PRs: write normal'));

// 3. Env beats config.
setConfig('ultra');
out = runHook({ hook_event_name: 'SessionStart' }, { MAESTRO_TERSE_LEVEL: 'lite' });
check('env beats config', flag() === 'lite');

// 4. Env off beats config: no flag, silent.
clearFlag();
out = runHook({ hook_event_name: 'SessionStart' }, { MAESTRO_TERSE_LEVEL: 'off' });
check('env off -> silent, no flag', out === '' && flag() === null);

// 5. UserPromptSubmit with active flag: one-line reminder.
clearConfig();
fs.writeFileSync(flagPath, 'ultra');
out = runHook({ hook_event_name: 'UserPromptSubmit', prompt: 'fix the bug' });
check('reminder fires when flag active', out.includes('MAESTRO TERSE ACTIVE (ultra)'));
check('reminder is UserPromptSubmit JSON', (() => {
  try { return JSON.parse(out).hookSpecificOutput.hookEventName === 'UserPromptSubmit'; }
  catch { return false; }
})());

// 6. UserPromptSubmit without flag: silent.
clearFlag();
out = runHook({ hook_event_name: 'UserPromptSubmit', prompt: 'fix the bug' });
check('no flag -> no reminder', out === '');

// 7. /maestro:terse ultra switches level.
clearFlag();
out = runHook({ hook_event_name: 'UserPromptSubmit', prompt: '/maestro:terse ultra' });
check('slash command sets level', flag() === 'ultra');

// 8. /terse off removes flag, no reminder same turn.
fs.writeFileSync(flagPath, 'full');
out = runHook({ hook_event_name: 'UserPromptSubmit', prompt: '/terse off' });
check('off removes flag', flag() === null);
check('off turn emits no reminder', out === '');

// 9. Bare /terse with no default: activates at full.
clearConfig(); clearFlag();
out = runHook({ hook_event_name: 'UserPromptSubmit', prompt: '/terse' });
check('bare /terse activates full', flag() === 'full');

// 10. Natural-language deactivation.
fs.writeFileSync(flagPath, 'ultra');
out = runHook({ hook_event_name: 'UserPromptSubmit', prompt: 'stop terse mode please' });
check('"stop terse" removes flag', flag() === null);
fs.writeFileSync(flagPath, 'ultra');
out = runHook({ hook_event_name: 'UserPromptSubmit', prompt: 'normal mode' });
check('"normal mode" removes flag', flag() === null);

// 11. Corrupted flag (not a whitelisted level): no reminder.
fs.writeFileSync(flagPath, 'rm -rf /');
out = runHook({ hook_event_name: 'UserPromptSubmit', prompt: 'hello' });
check('non-whitelisted flag -> silent', out === '');

// 12. Oversized flag: no reminder.
fs.writeFileSync(flagPath, 'u'.repeat(200));
out = runHook({ hook_event_name: 'UserPromptSubmit', prompt: 'hello' });
check('oversized flag -> silent', out === '');
clearFlag();

// 13. Symlinked flag: never read, no reminder.
fs.writeFileSync(path.join(tmp, 'secret'), 'ultra');
fs.symlinkSync(path.join(tmp, 'secret'), flagPath);
out = runHook({ hook_event_name: 'UserPromptSubmit', prompt: 'hello' });
check('symlinked flag -> silent', out === '');
clearFlag();

// 14. Symlinked flag is not overwritten by a level switch.
fs.writeFileSync(path.join(tmp, 'victim'), 'precious');
fs.symlinkSync(path.join(tmp, 'victim'), flagPath);
runHook({ hook_event_name: 'UserPromptSubmit', prompt: '/terse ultra' });
check('symlinked flag target untouched',
  fs.readFileSync(path.join(tmp, 'victim'), 'utf8') === 'precious');
clearFlag();

// 15. Garbage stdin: silent exit 0.
out = runHook('not json');
check('garbage stdin -> silent', out === '');

// 16. Unknown event: silent.
out = runHook({ hook_event_name: 'Stop' });
check('unknown event -> silent', out === '');

fs.rmSync(tmp, { recursive: true, force: true });

if (failures) { console.error(`${failures} failure(s)`); process.exit(1); }
console.log('all tests passed');
