'use strict';

// Interactive-PROXY probe for S2-S6 firing (zero-dep node).
//
// Drives a persistent multi-turn `claude -p` session via
// --input-format stream-json: turn 1 is the task prompt, turn 2 a
// follow-up scope extension sent only AFTER turn 1's result event —
// the closest autonomously-drivable analog to an interactive session.
// It is NOT a TTY session; label results interactive-PROXY.
//
// Isolation matches run-maestro-bench.ps1: temp CLAUDE_CONFIG_DIR with
// copied credentials and empty settings, doctrine ON files in the work
// dir, hidden oracle copied in only after the session exits.
//
// Usage: node benchmarks/probe-interactive-s2s6.cjs [--runs 3] [--model sonnet] [--budget 2.0]

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

const benchRoot = __dirname;
const repoRoot = path.dirname(benchRoot);
const taskId = 't12-feat-export-subsystem';
const taskDir = path.join(benchRoot, 'tasks', taskId);

function arg(name, dflt) {
  const i = process.argv.indexOf('--' + name);
  return i > -1 ? process.argv[i + 1] : dflt;
}
const runs = parseInt(arg('runs', '3'), 10);
const model = arg('model', 'sonnet');
const budget = arg('budget', '2.0');

const FOLLOW_UP =
  'Follow-up: also add an optional --pretty flag to all three export ' +
  'commands. When passed with --format json, pretty-print with a ' +
  '4-space indent instead of the default. Default behavior without ' +
  'the flag must stay exactly as it is. Update docs/commands.md ' +
  'accordingly.';

function copyDir(src, dst) {
  fs.cpSync(src, dst, { recursive: true });
}

function userMsg(text) {
  return JSON.stringify({
    type: 'user',
    message: { role: 'user', content: [{ type: 'text', text }] },
  }) + '\n';
}

function runSession(workDir, prompt, streamFile, env) {
  return new Promise((resolve) => {
    const args = [
      '-p',
      '--input-format', 'stream-json',
      '--output-format', 'stream-json',
      '--verbose',
      '--model', model,
      '--strict-mcp-config',
      '--no-session-persistence',
      '--max-budget-usd', budget,
      '--dangerously-skip-permissions',
    ];
    const child = spawn('claude', args, {
      cwd: workDir,
      env,
      shell: process.platform === 'win32',
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const events = [];
    let buf = '';
    let resultCount = 0;
    let stderr = '';

    child.stderr.on('data', (d) => { stderr += d; });
    child.stdout.on('data', (d) => {
      buf += d;
      let nl;
      while ((nl = buf.indexOf('\n')) > -1) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        events.push(line);
        let ev;
        try { ev = JSON.parse(line); } catch { continue; }
        if (ev.type === 'result') {
          resultCount++;
          if (resultCount === 1) {
            child.stdin.write(userMsg(FOLLOW_UP));
          } else if (resultCount === 2) {
            child.stdin.end();
          }
        }
      }
    });

    const killer = setTimeout(() => { child.kill(); }, 15 * 60 * 1000);
    child.on('close', (code) => {
      clearTimeout(killer);
      fs.writeFileSync(streamFile, events.join('\n') + '\n');
      resolve({ code, events, stderr, resultCount });
    });

    child.stdin.write(userMsg(prompt));
  });
}

function lastResult(events) {
  for (let i = events.length - 1; i >= 0; i--) {
    try {
      const ev = JSON.parse(events[i]);
      if (ev.type === 'result') return ev;
    } catch { /* skip */ }
  }
  return null;
}

function countSpawns(events) {
  const spawns = [];
  for (const line of events) {
    let ev;
    try { ev = JSON.parse(line); } catch { continue; }
    const content = ev.message && ev.message.content;
    if (ev.type === 'assistant' && Array.isArray(content)) {
      for (const b of content) {
        if (b.type === 'tool_use' && (b.name === 'Task' || b.name === 'Agent')) {
          spawns.push({
            subagent_type: b.input && b.input.subagent_type,
            description: b.input && b.input.description,
          });
        }
      }
    }
  }
  return spawns;
}

async function main() {
  const spec = JSON.parse(fs.readFileSync(path.join(taskDir, 'task.json'), 'utf8'));
  const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 15).replace(/(\d{8})(\d{6}).*/, '$1-$2');
  const workRoot = path.join(os.tmpdir(), 'maestro-bench');

  // Isolated config dir, same recipe as the PS runner.
  const cfgDir = path.join(workRoot, 'config-proxy');
  fs.mkdirSync(cfgDir, { recursive: true });
  const creds = path.join(os.homedir(), '.claude', '.credentials.json');
  if (fs.existsSync(creds)) fs.copyFileSync(creds, path.join(cfgDir, '.credentials.json'));
  else if (!process.env.ANTHROPIC_API_KEY) throw new Error('no credentials for isolated runs');
  fs.writeFileSync(path.join(cfgDir, 'settings.json'), '{}');
  const env = { ...process.env, CLAUDE_CONFIG_DIR: cfgDir };

  const streamDir = path.join(benchRoot, 'results', 'streams', `${stamp}-interactive-proxy-${model}`);
  fs.mkdirSync(streamDir, { recursive: true });

  const rows = [];
  for (let n = 1; n <= runs; n++) {
    const workDir = path.join(workRoot, `${taskId}-proxy-r${n}-${stamp}`);
    if (fs.existsSync(workDir)) fs.rmSync(workDir, { recursive: true, force: true });
    copyDir(path.join(taskDir, 'fixture'), workDir);
    fs.copyFileSync(path.join(repoRoot, 'AGENTS.md'), path.join(workDir, 'AGENTS.md'));
    fs.copyFileSync(path.join(repoRoot, 'CLAUDE.md'), path.join(workDir, 'CLAUDE.md'));

    process.stdout.write(`[${taskId}] proxy run=${n} model=${model} ...`);
    const t0 = Date.now();
    const streamFile = path.join(streamDir, `${taskId}-proxy-r${n}.jsonl`);
    const { code, events, stderr, resultCount } = await runSession(workDir, spec.prompt, streamFile, env);
    const wall = Date.now() - t0;

    // Hidden oracle lands only after the session exits.
    fs.copyFileSync(path.join(taskDir, 'verify.cjs'), path.join(workDir, 'verify.cjs'));
    const v = spawnSync(process.execPath, ['verify.cjs'], { cwd: workDir, encoding: 'utf8' });
    const pass = v.status === 0;

    const res = lastResult(events);
    const spawns = countSpawns(events);
    const row = {
      task: taskId,
      method: 'interactive-proxy (two-turn stream-json stdin, -p, non-TTY)',
      cli: 'claude',
      model,
      mode: 'on',
      run: n,
      pass,
      verify_note: pass ? null : String((v.stderr || v.stdout || '').split('\n')[0]),
      wall_ms: wall,
      num_turns: res ? res.num_turns : null,
      cost_usd: res ? res.total_cost_usd : null,
      result_events: resultCount,
      exit_code: code,
      is_error: res ? res.is_error === true : true,
      stderr_head: stderr ? stderr.slice(0, 200) : null,
      agent_spawns: spawns,
      stream_file: path.relative(path.join(benchRoot, 'results'), streamFile),
      timestamp: new Date().toISOString(),
    };
    rows.push(row);
    console.log(` ${pass ? 'PASS' : 'FAIL'} | ${wall} ms | results=${resultCount} | spawns=${spawns.length} | $${row.cost_usd}`);

    fs.rmSync(workDir, { recursive: true, force: true });
  }

  const outFile = path.join(benchRoot, 'results', `${stamp}-interactive-proxy-${model}.json`);
  fs.writeFileSync(outFile, JSON.stringify(rows, null, 2));
  console.log('Results written: ' + outFile);
}

main().catch((e) => { console.error(e); process.exit(1); });
