# Maestro benchmark runner (Windows / PowerShell 7+). Zero dependencies.
# Runs each task twice per cell: Maestro ON (AGENTS.md + CLAUDE.md in the
# work dir) vs OFF (doctrine files absent), via `claude -p`, in an isolated
# CLAUDE_CONFIG_DIR so global ~/.claude config (which may itself contain
# Maestro) cannot contaminate either cell.
#
# Usage:
#   pwsh -NoProfile -File run-maestro-bench.ps1                 # all tasks, both modes, 1 run
#   pwsh -NoProfile -File run-maestro-bench.ps1 -Task t01-fix-inclusive-range,t02-fix-even-median
#   pwsh -NoProfile -File run-maestro-bench.ps1 -Mode on -Runs 3 -Model sonnet
#   pwsh -NoProfile -File run-maestro-bench.ps1 -Mode on -InstallHooks   # hooked cell
#   pwsh -NoProfile -File run-maestro-bench.ps1 -Mode on -InstallHooks -Hooks gate-reminder
#
# Results land in results/<timestamp>-claude-<model>.json plus a console table.

[CmdletBinding()]
param(
  [string[]]$Task = @(),          # task ids; empty = all tasks
  [ValidateSet('on', 'off', 'both', 'core')]
  [string]$Mode = 'both',   # core = compact variants/AGENTS-core.md bundle
  [int]$Runs = 1,
  [string]$Model = 'sonnet',
  [double]$MaxBudgetUsd = 1.0,    # per task-run cap passed to claude
  [switch]$KeepWork,              # keep temp work dirs for inspection
  [switch]$SaveStream,            # capture full stream-json event log per run
  [switch]$InstallHooks,          # plant hooks/*.cjs + hooks.json wiring into a
                                  # second isolated config dir, used for on/core
                                  # runs only. Default OFF: baseline cells stay
                                  # hook-free and comparable. OFF-mode cells
                                  # never get hooks, flag or not.
  [string[]]$Hooks = @(),         # subset of the pack to stage, by short name
                                  # (gate-reminder, doctrine-guard, ...). Filters
                                  # BOTH the staged .cjs copies AND the hooks.json
                                  # wiring written into settings.json. Empty =
                                  # whole pack (today's behavior). Only meaningful
                                  # with -InstallHooks.
  [int]$MaxThinkingTokens = 0,    # >0: cap the fixed thinking budget via
                                  # MAX_THINKING_TOKENS for every run in this
                                  # invocation. Also sets
                                  # CLAUDE_CODE_DISABLE_ADAPTIVE_THINKING=1 --
                                  # on adaptive-reasoning models the fixed
                                  # budget only applies with adaptive disabled
                                  # (code.claude.com/docs/en/env-vars). 0 =
                                  # leave both unset (default; baselines).
  [switch]$DryRun                 # skip the claude call AND the oracle; build
                                  # and print one config row per cell. Free way
                                  # to confirm mode/hooks/hook_set without spend.
)

$ErrorActionPreference = 'Stop'
$benchRoot = $PSScriptRoot
$repoRoot = Split-Path $benchRoot -Parent
$tasksRoot = Join-Path $benchRoot 'tasks'
$resultsDir = Join-Path $benchRoot 'results'
$workRoot = Join-Path ([IO.Path]::GetTempPath()) 'maestro-bench'

$taskDirs = Get-ChildItem $tasksRoot -Directory | Sort-Object Name
if ($Task.Count -gt 0) {
  $taskDirs = $taskDirs | Where-Object { $Task -contains $_.Name }
  if (-not $taskDirs) { throw "No matching tasks. Available: $((Get-ChildItem $tasksRoot -Directory).Name -join ', ')" }
}
$modes = if ($Mode -eq 'both') { @('off', 'on') } else { @($Mode) }

# Isolated config dir: copied credentials, empty settings. No global
# CLAUDE.md/AGENTS.md, no hooks (unless -InstallHooks plants the shipped
# pack into a separate hooked config dir below), no MCP servers, no
# auto-memory.
$cfgDir = Join-Path $workRoot 'config'
New-Item -ItemType Directory -Force $cfgDir | Out-Null
$creds = Join-Path $env:USERPROFILE '.claude\.credentials.json'
if (Test-Path $creds) { Copy-Item $creds $cfgDir -Force }
elseif (-not $env:ANTHROPIC_API_KEY) { throw 'No ~/.claude/.credentials.json and no ANTHROPIC_API_KEY - cannot authenticate isolated runs.' }
Set-Content (Join-Path $cfgDir 'settings.json') '{}'

# Hooked config dir: same isolation plus the shipped hook pack wired via
# settings.json. Separate dir so plain and hooked runs can interleave in
# one invocation without cross-contamination. Rebuilt every invocation so
# hook edits propagate and stale state never leaks between sessions.
$cfgHooksDir = Join-Path $workRoot 'config-hooks'
if ($InstallHooks) {
  if (Test-Path $cfgHooksDir) { Remove-Item $cfgHooksDir -Recurse -Force }
  $stagedHooks = Join-Path $cfgHooksDir 'hooks'
  New-Item -ItemType Directory -Force $stagedHooks | Out-Null
  if (Test-Path $creds) { Copy-Item $creds $cfgHooksDir -Force }
  $packFiles = Get-ChildItem (Join-Path $repoRoot 'hooks') -Filter '*.cjs' |
    Where-Object { $_.Name -notlike '*.test.cjs' }
  if ($Hooks.Count -gt 0) {
    $packFiles = foreach ($name in $Hooks) {
      $hit = $packFiles | Where-Object { $_.BaseName -eq $name -or $_.BaseName -eq "maestro-$name" }
      if (-not $hit) { throw "-Hooks '$name' matches nothing in hooks/. Available: $((Get-ChildItem (Join-Path $repoRoot 'hooks') -Filter '*.cjs' | Where-Object { $_.Name -notlike '*.test.cjs' }).BaseName -replace '^maestro-', '' -join ', ')" }
      $hit
    }
  }
  $packFiles | Copy-Item -Destination $stagedHooks -Force
  $wiring = Get-Content (Join-Path $repoRoot 'hooks\hooks.json') -Raw
  if ($Hooks.Count -gt 0) {
    # Keep only wiring entries whose command references a selected hook file;
    # drop emptied matcher groups and event keys so the agent never sees the
    # unselected hooks at all.
    $cfg = $wiring | ConvertFrom-Json
    $stagedNames = @($packFiles | ForEach-Object { $_.Name })
    foreach ($evt in @($cfg.hooks.PSObject.Properties.Name)) {
      $keptGroups = @(foreach ($group in @($cfg.hooks.$evt)) {
        $kept = @($group.hooks | Where-Object {
          $cmd = $_.command
          @($stagedNames | Where-Object { $cmd -like "*$_*" }).Count -gt 0
        })
        if ($kept.Count -gt 0) { $group.hooks = $kept; $group }
      })
      if ($keptGroups.Count -gt 0) { $cfg.hooks.$evt = $keptGroups }
      else { $cfg.hooks.PSObject.Properties.Remove($evt) }
    }
    $wiring = $cfg | ConvertTo-Json -Depth 8
  }
  $wiring = $wiring.Replace('${CLAUDE_PLUGIN_ROOT}', ($cfgHooksDir -replace '\\', '/'))
  Set-Content (Join-Path $cfgHooksDir 'settings.json') $wiring
}

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$results = [System.Collections.Generic.List[object]]::new()

# Stream capture: full event log per run (for behavioral compliance
# scoring via score-compliance.cjs). stream-json requires --verbose
# when combined with -p (CLI-enforced).
$streamDir = $null
if ($SaveStream) {
  $streamDir = Join-Path $resultsDir "streams\$stamp-claude-$Model"
  New-Item -ItemType Directory -Force $streamDir | Out-Null
}

foreach ($taskDir in $taskDirs) {
  $spec = Get-Content (Join-Path $taskDir.FullName 'task.json') -Raw | ConvertFrom-Json
  foreach ($runMode in $modes) {
    for ($n = 1; $n -le $Runs; $n++) {
      $workDir = Join-Path $workRoot "$($spec.id)-$runMode-r$n-$stamp"
      if (Test-Path $workDir) { Remove-Item $workDir -Recurse -Force }
      New-Item -ItemType Directory -Force $workDir | Out-Null
      Copy-Item (Join-Path $taskDir.FullName 'fixture\*') $workDir -Recurse -Force
      if ($runMode -eq 'on') {
        Copy-Item (Join-Path $repoRoot 'AGENTS.md') $workDir -Force
        Copy-Item (Join-Path $repoRoot 'CLAUDE.md') $workDir -Force
      } elseif ($runMode -eq 'core') {
        Copy-Item (Join-Path $benchRoot 'variants\AGENTS-core.md') (Join-Path $workDir 'AGENTS.md') -Force
        Set-Content (Join-Path $workDir 'CLAUDE.md') "@AGENTS.md"
      }

      # Hooks only ever apply to doctrine-bearing modes; off cells always
      # run against the plain config dir regardless of -InstallHooks.
      $runHooked = $InstallHooks -and $runMode -ne 'off'

      Write-Host "[$($spec.id)] mode=$runMode run=$n model=$Model hooks=$runHooked ..." -NoNewline

      # Dry run: no claude call, no oracle. Emit one row showing the cell's
      # resolved config so an operator can confirm (free) that an OFF+hook arm
      # reads mode=off, hooks=true, hook_set=<name>, with NO doctrine copied.
      if ($DryRun) {
        $dryHookSet = if (-not $runHooked) { $null } elseif ($Hooks.Count -gt 0) { $Hooks -join ',' } else { 'pack' }
        $dryDoctrine = ($runMode -eq 'on' -or $runMode -eq 'core')
        $dryCfg = if ($runHooked) { 'config-hooks' } else { 'config' }
        Write-Host (" DRYRUN | hooks={0} | hook_set={1} | cfg={2} | doctrine_copied={3}" -f $runHooked, ($dryHookSet ?? '<none>'), $dryCfg, $dryDoctrine)
        $results.Add([pscustomobject]([ordered]@{
          task = $spec.id; category = $spec.category; cli = 'claude'; model = $Model
          mode = $runMode; hooks = $runHooked; hook_set = $dryHookSet
          doctrine_copied = $dryDoctrine; config_dir = $dryCfg; dry_run = $true
        }))
        if (-not $KeepWork) { Remove-Item $workDir -Recurse -Force -ErrorAction SilentlyContinue }
        continue
      }

      $prevCfg = $env:CLAUDE_CONFIG_DIR
      $env:CLAUDE_CONFIG_DIR = if ($runHooked) { $cfgHooksDir } else { $cfgDir }
      $prevThink = $env:MAX_THINKING_TOKENS
      $prevAdaptive = $env:CLAUDE_CODE_DISABLE_ADAPTIVE_THINKING
      if ($MaxThinkingTokens -gt 0) {
        $env:MAX_THINKING_TOKENS = "$MaxThinkingTokens"
        $env:CLAUDE_CODE_DISABLE_ADAPTIVE_THINKING = '1'
      }
      Push-Location $workDir
      $sw = [Diagnostics.Stopwatch]::StartNew()
      try {
        if ($SaveStream) {
          $raw = '' | claude -p $spec.prompt --model $Model --output-format stream-json --verbose `
            --strict-mcp-config --no-session-persistence `
            --max-budget-usd $MaxBudgetUsd --dangerously-skip-permissions 2>$null
        } else {
          $raw = '' | claude -p $spec.prompt --model $Model --output-format json `
            --strict-mcp-config --no-session-persistence `
            --max-budget-usd $MaxBudgetUsd --dangerously-skip-permissions 2>$null
        }
      } finally {
        $sw.Stop()
        Pop-Location
        $env:CLAUDE_CONFIG_DIR = $prevCfg
        $env:MAX_THINKING_TOKENS = $prevThink
        $env:CLAUDE_CODE_DISABLE_ADAPTIVE_THINKING = $prevAdaptive
      }

      $json = $null
      $streamFile = $null
      if ($SaveStream) {
        $streamFile = Join-Path $streamDir "$($spec.id)-$runMode-r$n.jsonl"
        Set-Content $streamFile (@($raw) -join "`n")
        $resultLine = @($raw) | Where-Object { $_ -match '^\{"type":"result"' } | Select-Object -Last 1
        try { $json = $resultLine | ConvertFrom-Json } catch {}
      } else {
        try { $json = ($raw -join "`n") | ConvertFrom-Json } catch {}
      }

      # Oracle stays hidden during the run: verify.cjs lands only after the
      # agent finishes (visible tests inflate pass rates 20-60%, FeatureBench).
      Copy-Item (Join-Path $taskDir.FullName 'verify.cjs') $workDir -Force
      Push-Location $workDir
      try {
        $verifyOut = (node verify.cjs 2>&1 | Select-Object -First 1) -join ''
        $pass = ($LASTEXITCODE -eq 0)
      } finally { Pop-Location }

      $row = [ordered]@{
        task        = $spec.id
        category    = $spec.category
        cli         = 'claude'
        model       = $Model
        mode        = $runMode
        hooks       = $runHooked
        hook_set    = if (-not $runHooked) { $null } elseif ($Hooks.Count -gt 0) { $Hooks -join ',' } else { 'pack' }
        think_cap   = if ($MaxThinkingTokens -gt 0) { $MaxThinkingTokens } else { $null }
        run         = $n
        pass        = $pass
        verify_note = if ($pass) { $null } else { [string]$verifyOut }
        wall_ms     = $sw.ElapsedMilliseconds
        agent_ms    = $json.duration_ms
        num_turns   = $json.num_turns
        cost_usd    = $json.total_cost_usd
        in_tokens   = $json.usage.input_tokens
        out_tokens  = $json.usage.output_tokens
        cache_read  = $json.usage.cache_read_input_tokens
        cache_write = $json.usage.cache_creation_input_tokens
        is_error    = if ($null -ne $json) { $json.is_error } else { $true }
        stream_file = if ($streamFile) { [IO.Path]::GetRelativePath($resultsDir, $streamFile) } else { $null }
        work_dir    = $workDir
        timestamp   = (Get-Date -Format 'o')
      }
      $results.Add([pscustomobject]$row)
      Write-Host (" {0} | {1:n0} ms | {2} turns | `${3:n4}" -f ($pass ? 'PASS' : 'FAIL'), $sw.ElapsedMilliseconds, $json.num_turns, $json.total_cost_usd)

      if (-not $KeepWork) { Remove-Item $workDir -Recurse -Force -ErrorAction SilentlyContinue }
    }
  }
}

New-Item -ItemType Directory -Force $resultsDir | Out-Null
$outFile = Join-Path $resultsDir "$stamp-claude-$Model.json"
$results | ConvertTo-Json -Depth 4 | Set-Content $outFile
Write-Host "`nResults written: $outFile"
$results | Format-Table task, mode, run, pass, wall_ms, num_turns, cost_usd -AutoSize
