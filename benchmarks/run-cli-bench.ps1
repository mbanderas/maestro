# Maestro cross-CLI benchmark runner (Windows / PowerShell 7+). Zero dependencies.
# Sibling of run-maestro-bench.ps1 for Codex and Gemini cells. Same fixture/verify
# flow; only the agent invocation differs.
#
# Isolation (verified against installed CLIs 2026-06-10):
#   codex  - fresh CODEX_HOME containing only auth.json (no config.toml, so no
#            global MCP servers, plugins, hooks, or instruction files load).
#            ON cell = AGENTS.md copied into the work dir (Codex reads it natively).
#   gemini - no home-override env exists; the global ~/.gemini was inspected and
#            contains no GEMINI.md and no instruction-bearing settings, so both
#            cells share identical (clean) global state. ON cell = AGENTS.md +
#            GEMINI.md copied into the work dir.
#
# Usage:
#   ./run-cli-bench.ps1 -Cli codex -Task t01-fix-inclusive-range -Runs 1
#   ./run-cli-bench.ps1 -Cli gemini -Mode both -Runs 1

[CmdletBinding()]
param(
  [Parameter(Mandatory)]
  [ValidateSet('codex', 'gemini')]
  [string]$Cli,
  [string[]]$Task = @(),
  [ValidateSet('on', 'off', 'both')]
  [string]$Mode = 'both',
  [int]$Runs = 1,
  [string]$Model = '',            # empty = CLI default (recorded as reported/configured)
  [switch]$KeepWork
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

# Codex isolation home: auth only, nothing else.
$codexHome = Join-Path $workRoot 'codex-home'
if ($Cli -eq 'codex') {
  New-Item -ItemType Directory -Force $codexHome | Out-Null
  $auth = Join-Path $env:USERPROFILE '.codex\auth.json'
  if (-not (Test-Path $auth)) { throw 'No ~/.codex/auth.json - cannot authenticate isolated codex runs.' }
  Copy-Item $auth $codexHome -Force
}

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$results = [System.Collections.Generic.List[object]]::new()

foreach ($taskDir in $taskDirs) {
  $spec = Get-Content (Join-Path $taskDir.FullName 'task.json') -Raw | ConvertFrom-Json
  foreach ($runMode in $modes) {
    for ($n = 1; $n -le $Runs; $n++) {
      $workDir = Join-Path $workRoot "$($spec.id)-$Cli-$runMode-r$n-$stamp"
      if (Test-Path $workDir) { Remove-Item $workDir -Recurse -Force }
      New-Item -ItemType Directory -Force $workDir | Out-Null
      Copy-Item (Join-Path $taskDir.FullName 'fixture\*') $workDir -Recurse -Force
      if ($runMode -eq 'on') {
        Copy-Item (Join-Path $repoRoot 'AGENTS.md') $workDir -Force
        if ($Cli -eq 'gemini') { Copy-Item (Join-Path $repoRoot 'GEMINI.md') $workDir -Force }
      }

      Write-Host "[$($spec.id)] cli=$Cli mode=$runMode run=$n ..." -NoNewline
      Push-Location $workDir
      $sw = [Diagnostics.Stopwatch]::StartNew()
      $raw = ''
      try {
        if ($Cli -eq 'codex') {
          $prevHome = $env:CODEX_HOME
          $env:CODEX_HOME = $codexHome
          try {
            $cliArgs = @('exec', '--json', '--skip-git-repo-check', '--ephemeral',
              '--dangerously-bypass-approvals-and-sandbox')
            if ($Model) { $cliArgs += @('-m', $Model) }
            $raw = ('' | & codex @cliArgs $spec.prompt 2>$null) -join "`n"
          } finally { $env:CODEX_HOME = $prevHome }
        } else {
          $cliArgs = @('-p', $spec.prompt, '--output-format', 'json', '--approval-mode', 'yolo', '--skip-trust')
          if ($Model) { $cliArgs += @('-m', $Model) }
          $raw = ('' | & gemini @cliArgs 2>$null) -join "`n"
        }
      } finally {
        $sw.Stop()
        Pop-Location
      }

      # Oracle stays hidden during the run: verify.cjs lands only after the
      # agent finishes (visible tests inflate pass rates 20-60%, FeatureBench).
      Copy-Item (Join-Path $taskDir.FullName 'verify.cjs') $workDir -Force
      Push-Location $workDir
      try {
        $verifyOut = (node verify.cjs 2>&1 | Select-Object -First 1) -join ''
        $pass = ($LASTEXITCODE -eq 0)
      } finally { Pop-Location }

      # Best-effort usage extraction; schemas differ per CLI and are recorded raw.
      $inTok = $null; $outTok = $null; $cached = $null; $reportedModel = $Model
      if ($Cli -eq 'codex') {
        foreach ($line in ($raw -split "`n")) {
          $evt = $null
          try { $evt = $line | ConvertFrom-Json } catch { continue }
          $usage = $evt.usage ?? $evt.msg.info.total_token_usage ?? $evt.info.total_token_usage
          if ($usage) {
            $inTok = $usage.input_tokens; $outTok = $usage.output_tokens
            $cached = $usage.cached_input_tokens ?? $usage.cache_read_input_tokens
          }
          if (-not $reportedModel -and $evt.model) { $reportedModel = $evt.model }
        }
      } else {
        $json = $null
        try { $json = $raw | ConvertFrom-Json } catch {}
        # Gemini sometimes emits non-JSON noise (quota notices) before the
        # JSON document; retry from the first brace so usage still parses.
        if (-not $json -and $raw) {
          $i = $raw.IndexOf('{')
          if ($i -ge 0) { try { $json = $raw.Substring($i) | ConvertFrom-Json } catch {} }
        }
        if ($json -and $json.stats.models) {
          $names = @($json.stats.models.PSObject.Properties.Name)
          if (-not $reportedModel -and $names.Count -gt 0) { $reportedModel = $names -join '+' }
          foreach ($name in $names) {
            $tok = $json.stats.models.$name.tokens
            if ($tok) { $inTok += $tok.prompt; $outTok += $tok.candidates; $cached += $tok.cached }
          }
        }
      }

      $row = [ordered]@{
        task        = $spec.id
        category    = $spec.category
        cli         = $Cli
        model       = $reportedModel
        mode        = $runMode
        run         = $n
        pass        = $pass
        verify_note = if ($pass) { $null } else { [string]$verifyOut }
        wall_ms     = $sw.ElapsedMilliseconds
        in_tokens   = $inTok
        out_tokens  = $outTok
        cache_read  = $cached
        agent_error = if (-not $outTok -and $raw) { $raw.Substring(0, [Math]::Min(200, $raw.Length)) } elseif (-not $raw) { 'EMPTY_OUTPUT' } else { $null }
        timestamp   = (Get-Date -Format 'o')
      }
      $results.Add([pscustomobject]$row)
      Write-Host (" {0} | {1:n0} ms" -f ($pass ? 'PASS' : 'FAIL'), $sw.ElapsedMilliseconds)

      if (-not $KeepWork) { Remove-Item $workDir -Recurse -Force -ErrorAction SilentlyContinue }
    }
  }
}

New-Item -ItemType Directory -Force $resultsDir | Out-Null
$outFile = Join-Path $resultsDir "$stamp-$Cli.json"
$results | ConvertTo-Json -Depth 4 | Set-Content $outFile
Write-Host "`nResults written: $outFile"
$results | Format-Table task, mode, run, pass, wall_ms, out_tokens -AutoSize
