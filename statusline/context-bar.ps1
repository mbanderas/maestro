# Maestro context bar -- Claude Code status line progress bar (Windows / PowerShell).
# Renders context-window usage: [########------------] 42% 84k/200k . folder
# Disable: create an empty file named .context-bar-disabled next to this
# script, or run the /context-bar slash command. Default is enabled.

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = 'SilentlyContinue'

$raw = [Console]::In.ReadToEnd()
try { $ctx = $raw | ConvertFrom-Json } catch { $ctx = $null }

$transcript = $ctx.transcript_path
$modelId    = $ctx.model.id
$cwd        = $ctx.workspace.current_dir
if (-not $cwd) { $cwd = $ctx.cwd }
if ($cwd) { $folder = Split-Path -Leaf $cwd } else { $folder = '?' }

$esc   = [char]27
$dim   = "$esc[90m"
$reset = "$esc[0m"

# Terse-mode badge. Reads the .maestro-terse flag written by
# hooks/maestro-terse-mode.cjs. Hardening mirrors context-bar.sh:
# refuse symlinks (flag could point at a secret and the statusline
# would render its bytes every keystroke), 64-byte read cap, strip to
# [a-z], whitelist -- never echo attacker-controlled bytes.
function Get-TerseBadge {
    $cfg = if ($env:CLAUDE_CONFIG_DIR) { $env:CLAUDE_CONFIG_DIR } else { Join-Path $HOME '.claude' }
    $item = Get-Item -LiteralPath (Join-Path $cfg '.maestro-terse') -Force -ErrorAction SilentlyContinue
    if (-not $item -or $item.PSIsContainer) { return '' }
    if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { return '' }
    try {
        $fs = [IO.File]::OpenRead($item.FullName)
        try {
            $buf = New-Object byte[] 64
            $n = $fs.Read($buf, 0, 64)
            $mode = [Text.Encoding]::ASCII.GetString($buf, 0, $n)
        } finally { $fs.Dispose() }
    } catch { return '' }
    $mode = $mode.ToLower() -replace '[^a-z]', ''
    if ($mode -notin @('lite', 'full', 'ultra')) { return '' }
    return " $esc[38;5;172m[TERSE:$($mode.ToUpper())]$reset"
}

# Disabled via flag file -> show folder name only, skip the bar.
$flag = Join-Path $PSScriptRoot '.context-bar-disabled'
if (Test-Path -LiteralPath $flag) {
    [Console]::Out.Write("$dim$folder$reset$(Get-TerseBadge)")
    return
}

function Get-Cap($id) {
    if (-not $id) { return 200000 }
    $s = $id.ToLower()
    if ($s -match '1m' -or $s -match '\[1m\]') { return 1000000 }
    if ($s -match 'fable' -or $s -match 'mythos') { return 1000000 }
    if ($s -match 'opus-4-[678]') { return 1000000 }
    if ($s -match 'sonnet-4-6') { return 200000 }
    if ($s -match 'sonnet')     { return 200000 }
    if ($s -match 'haiku')      { return 200000 }
    if ($s -match 'opus')       { return 200000 }
    return 200000
}
# Prefer the cap Claude Code reports; model-id heuristic is the fallback.
$cap = 0
if ($ctx.context_window.context_window_size) {
    $cap = [int]$ctx.context_window.context_window_size
}
if ($cap -le 0) { $cap = Get-Cap $modelId }

$used = 0
if ($transcript -and (Test-Path $transcript)) {
    $lines = Get-Content -LiteralPath $transcript -Tail 80 -ErrorAction SilentlyContinue
    for ($i = $lines.Count - 1; $i -ge 0; $i--) {
        try { $obj = $lines[$i] | ConvertFrom-Json } catch { continue }
        if ($obj.type -ne 'assistant') { continue }
        $u = $obj.message.usage
        if (-not $u) { continue }
        $used = [int]$u.input_tokens + [int]$u.cache_read_input_tokens + [int]$u.cache_creation_input_tokens + [int]$u.output_tokens
        break
    }
}

if ($cap -le 0) { $cap = 200000 }
$pct = [math]::Min(100, [math]::Floor(($used / $cap) * 100))

$width = 20
$filled = [math]::Floor(($used / $cap) * $width)
if ($filled -gt $width) { $filled = $width }
if ($filled -lt 0) { $filled = 0 }

if    ($pct -lt 60)  { $color = "$esc[32m" }
elseif ($pct -lt 85) { $color = "$esc[33m" }
else                 { $color = "$esc[31m" }

$full  = [char]0x2588
$empty = [char]0x2591
$bar = ($color + ([string]$full * $filled) + $dim + ([string]$empty * ($width - $filled)) + $reset)

function Format-Tokens($n) {
    if ($n -ge 1000000) {
        $m = [math]::Floor($n / 1000000 * 100 + 0.5) / 100
        return ("{0:F2}M" -f $m)
    }
    if ($n -ge 1000) {
        $k = [math]::Floor($n / 1000 + 0.5)
        return ("{0}k" -f $k)
    }
    return "$n"
}
$usedTxt = Format-Tokens $used
$capTxt  = Format-Tokens $cap

$sep = [char]0x00B7
[Console]::Out.Write("$bar $color$pct%$reset $dim$usedTxt/$capTxt$reset $dim$sep$reset $folder$(Get-TerseBadge)")
