<#
.SYNOPSIS
    Sync Maestro AGENTS.md to downstream repos listed in scripts/downstream.txt.

.DESCRIPTION
    Copies Maestro/AGENTS.md verbatim to each downstream workspace root.
    Warns if downstream CLAUDE.md exists but lacks `@AGENTS.md` import.
    Does NOT git-add or commit — review and commit per repo manually.

.PARAMETER WorkspaceRoot
    Parent dir containing all workspaces. Default: C:\Users\mail\Workspaces

.PARAMETER DryRun
    Show what would change. No writes.

.EXAMPLE
    pwsh ./scripts/sync-maestro.ps1
    pwsh ./scripts/sync-maestro.ps1 -DryRun
#>
[CmdletBinding()]
param(
    [string]$WorkspaceRoot = 'C:\Users\mail\Workspaces',
    [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$maestroRoot = Split-Path -Parent $scriptDir
$source = Join-Path $maestroRoot 'AGENTS.md'
$listFile = Join-Path $scriptDir 'downstream.txt'

if (-not (Test-Path $source)) { throw "Missing source: $source" }
if (-not (Test-Path $listFile)) { throw "Missing list: $listFile" }

$sourceHash = (Get-FileHash $source).Hash
$targets = Get-Content $listFile | ForEach-Object { $_.Trim() } |
    Where-Object { $_ -and -not $_.StartsWith('#') }

$copied = 0; $skipped = 0; $missing = 0; $warnings = @()

foreach ($name in $targets) {
    $repoDir = Join-Path $WorkspaceRoot $name
    if (-not (Test-Path $repoDir)) {
        Write-Host "MISS  $name (workspace not found)" -ForegroundColor Yellow
        $missing++; continue
    }

    $dest = Join-Path $repoDir 'AGENTS.md'
    $needsCopy = $true
    if (Test-Path $dest) {
        if ((Get-FileHash $dest).Hash -eq $sourceHash) {
            Write-Host "OK    $name" -ForegroundColor DarkGray
            $skipped++; $needsCopy = $false
        }
    }

    if ($needsCopy) {
        if ($DryRun) {
            Write-Host "DRY   $name (would copy)" -ForegroundColor Cyan
        } else {
            Copy-Item -Path $source -Destination $dest -Force
            Write-Host "COPY  $name" -ForegroundColor Green
        }
        $copied++
    }

    $claudeMd = Join-Path $repoDir 'CLAUDE.md'
    if (Test-Path $claudeMd) {
        $hasImport = Select-String -Path $claudeMd -Pattern '@AGENTS\.md' -Quiet
        if (-not $hasImport) { $warnings += "  $name/CLAUDE.md exists but missing '@AGENTS.md' import" }
    }
}

Write-Host ''
Write-Host "Source hash: $sourceHash"
Write-Host "Copied: $copied  Up-to-date: $skipped  Missing dirs: $missing"
if ($warnings.Count) {
    Write-Host ''
    Write-Host "Warnings:" -ForegroundColor Yellow
    $warnings | ForEach-Object { Write-Host $_ -ForegroundColor Yellow }
}
if ($DryRun) { Write-Host ''; Write-Host "(dry-run — no files written)" -ForegroundColor Cyan }
