<#
.SYNOPSIS
    Sync Maestro doctrine (the AGENTS.md kernel) to downstream repos listed in
    scripts/downstream.txt.

.DESCRIPTION
    For each downstream workspace, invokes
    `node scripts/install.cjs --project <repo> --doctrine-only`, which splices
    the Maestro doctrine block between its `<!-- maestro:begin -->` /
    `<!-- maestro:end -->` markers: it refreshes stale doctrine in place while
    preserving any user content outside the block. install.cjs is the single
    merge source of truth; this script never overwrites a whole AGENTS.md
    (no more Copy-Item -Force clobber).
    Warns if a downstream CLAUDE.md exists but lacks the `@AGENTS.md` import.
    Does NOT git-add or commit — review and commit per repo manually.

.PARAMETER WorkspaceRoot
    Parent dir containing all workspaces. Default: C:\Users\mail\Workspaces

.PARAMETER ListFile
    File of downstream workspace names (one per line; blank lines and lines
    starting with # are ignored). Default: scripts/downstream.txt

.PARAMETER DryRun
    Show what would change. No writes (passed through to install.cjs).

.EXAMPLE
    pwsh ./scripts/sync-maestro.ps1
    pwsh ./scripts/sync-maestro.ps1 -DryRun
#>
[CmdletBinding()]
param(
    [string]$WorkspaceRoot = 'C:\Users\mail\Workspaces',
    [string]$ListFile,
    [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$installer = Join-Path $scriptDir 'install.cjs'
if (-not $ListFile) { $ListFile = Join-Path $scriptDir 'downstream.txt' }

if (-not (Test-Path $installer)) { throw "Missing installer: $installer" }
if (-not (Test-Path $ListFile)) { throw "Missing list: $ListFile" }

$targets = Get-Content $ListFile | ForEach-Object { $_.Trim() } |
    Where-Object { $_ -and -not $_.StartsWith('#') }

$synced = 0; $failed = 0; $missing = 0; $warnings = @()

foreach ($name in $targets) {
    $repoDir = Join-Path $WorkspaceRoot $name
    if (-not (Test-Path $repoDir)) {
        Write-Host "MISS  $name (workspace not found)" -ForegroundColor Yellow
        $missing++; continue
    }

    $nodeArgs = @($installer, '--project', $repoDir, '--doctrine-only')
    if ($DryRun) { $nodeArgs += '--dry-run' }
    & node @nodeArgs
    if ($LASTEXITCODE -ne 0) {
        Write-Host "FAIL  $name (installer exit $LASTEXITCODE)" -ForegroundColor Red
        $failed++
    } else {
        Write-Host "SYNC  $name" -ForegroundColor Green
        $synced++
    }

    $claudeMd = Join-Path $repoDir 'CLAUDE.md'
    if (Test-Path $claudeMd) {
        $hasImport = Select-String -Path $claudeMd -Pattern '@AGENTS\.md' -Quiet
        if (-not $hasImport) { $warnings += "  $name/CLAUDE.md exists but missing '@AGENTS.md' import" }
    }
}

Write-Host ''
Write-Host "Synced: $synced  Failed: $failed  Missing dirs: $missing"
if ($warnings.Count) {
    Write-Host ''
    Write-Host "Warnings:" -ForegroundColor Yellow
    $warnings | ForEach-Object { Write-Host $_ -ForegroundColor Yellow }
}
if ($DryRun) { Write-Host ''; Write-Host "(dry-run — no files written)" -ForegroundColor Cyan }
if ($failed) { exit 1 }
