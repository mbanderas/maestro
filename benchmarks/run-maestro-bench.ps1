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
  [switch]$SaveStream             # capture full stream-json event log per run
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
# CLAUDE.md/AGENTS.md, no hooks, no MCP servers, no auto-memory.
$cfgDir = Join-Path $workRoot 'config'
New-Item -ItemType Directory -Force $cfgDir | Out-Null
$creds = Join-Path $env:USERPROFILE '.claude\.credentials.json'
if (Test-Path $creds) { Copy-Item $creds $cfgDir -Force }
elseif (-not $env:ANTHROPIC_API_KEY) { throw 'No ~/.claude/.credentials.json and no ANTHROPIC_API_KEY - cannot authenticate isolated runs.' }
Set-Content (Join-Path $cfgDir 'settings.json') '{}'

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

      Write-Host "[$($spec.id)] mode=$runMode run=$n model=$Model ..." -NoNewline
      $prevCfg = $env:CLAUDE_CONFIG_DIR
      $env:CLAUDE_CONFIG_DIR = $cfgDir
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
