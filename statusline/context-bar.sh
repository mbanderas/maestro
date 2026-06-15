#!/usr/bin/env bash
# Maestro context bar -- Claude Code status line progress bar (macOS / Linux).
# Renders context-window usage: [########------------] 42% 84k/200k . folder
# Disable: create an empty file named .context-bar-disabled next to this
# script, or run the /context-bar slash command. Default is enabled.
# Requires `jq` for the bar; without it the status line shows the folder only.

input="$(cat)"
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

esc=$'\033'
dim="${esc}[90m"
reset="${esc}[0m"

# Terse-mode badge. Reads the .maestro-terse flag written by
# hooks/maestro-terse-mode.cjs. Hardening ported from Caveman (MIT):
# refuse symlinks (flag could point at a secret and the statusline
# would render its bytes every keystroke), 64-byte read cap, strip to
# [a-z], whitelist — never echo attacker-controlled bytes.
terse_badge() {
  local flag="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/.maestro-terse"
  [ -L "$flag" ] && return
  [ ! -f "$flag" ] && return
  local mode
  mode=$(head -c 64 "$flag" 2>/dev/null | tr -d '\n\r' | tr '[:upper:]' '[:lower:]')
  mode=$(printf '%s' "$mode" | tr -cd 'a-z')
  case "$mode" in
    lite|full|ultra) ;;
    *) return ;;
  esac
  printf ' %s%s%s' "${esc}[38;5;172m" "$(printf '%s' "$mode" | tr '[:lower:]' '[:upper:]')" "$reset"
}

# Frontier badge. Reads frontier-state.json (configDir = $XDG_CONFIG_HOME/maestro
# else ~/.config/maestro), written by frontier/config.cjs. Same hardening as the
# terse badge: refuse symlinks, size cap, and only ever emit letters from the
# whitelist below or an integer count -- never raw bytes from the file. Letter
# tables mirror frontier/config.cjs DEFAULTS; keep in sync if models/presets
# change. Needs jq. Output: presence = on, absence = off (no ON/OFF text).
frontier_badge() {
  [ "$have_jq" -eq 1 ] || return
  local f="${XDG_CONFIG_HOME:-$HOME/.config}/maestro/frontier-state.json"
  [ -L "$f" ] && return
  [ ! -f "$f" ] && return
  local sz
  sz=$(wc -c < "$f" 2>/dev/null | tr -d ' ')
  [ -n "$sz" ] && [ "$sz" -gt 8192 ] && return
  local mode panel n
  mode=$(jq -r '.mode // empty' "$f" 2>/dev/null)
  case "$mode" in
    single)
      case "$(jq -r '.model // empty' "$f" 2>/dev/null)" in
        opus) panel='O' ;; gpt-5.5) panel='C' ;; gemini) panel='G' ;; *) panel='' ;;
      esac
      ;;
    fusion)
      case "$(jq -r '.preset // empty' "$f" 2>/dev/null)" in
        opus-duo) panel='O+O' ;;
        opus-gpt) panel='O+C' ;;
        gpt-duo) panel='C+C' ;;
        frontier-trio) panel='O+C+G' ;;
        custom)
          n=$(jq -r '(.models | length) // 0' "$f" 2>/dev/null)
          [[ "$n" =~ ^[0-9]+$ ]] || n=0
          [ "$n" -gt 9 ] && n=9
          if [ "$n" -ge 1 ]; then panel="✦$n"; else panel=''; fi
          ;;
        *) panel='' ;;
      esac
      ;;
    *) return ;;
  esac
  printf ' %sƒ%s%s' "${esc}[38;5;75m" "$panel" "$reset"
}

have_jq=0
command -v jq >/dev/null 2>&1 && have_jq=1

# Resolve folder name early -- shown even when the bar is disabled.
cwd=""
[ "$have_jq" -eq 1 ] && cwd="$(printf '%s' "$input" | jq -r '.workspace.current_dir // .cwd // empty')"
folder="?"
[ -n "$cwd" ] && folder="$(basename "$cwd")"

# Disabled via flag file, or jq missing -> show folder name only.
if [ -f "$script_dir/.context-bar-disabled" ] || [ "$have_jq" -eq 0 ]; then
  printf '%s%s%s%s%s' "$dim" "$folder" "$reset" "$(terse_badge)" "$(frontier_badge)"
  exit 0
fi

transcript="$(printf '%s' "$input" | jq -r '.transcript_path // empty')"
model_id="$(printf '%s' "$input" | jq -r '.model.id // empty')"

# Model context-window cap. Prefer the cap Claude Code reports; the
# model-id heuristic is the fallback for older payloads without it.
cap="$(printf '%s' "$input" | jq -r '.context_window.context_window_size // 0')"
[[ "$cap" =~ ^[0-9]+$ ]] || cap=0
if [ "$cap" -le 0 ]; then
  cap=200000
  shopt -s nocasematch
  case "$model_id" in
    *1m*|*"[1m]"*)     cap=1000000 ;;
    *fable*|*mythos*)  cap=1000000 ;;
    *opus-4-6*|*opus-4-7*|*opus-4-8*) cap=1000000 ;;
    *)                 cap=200000 ;;
  esac
  shopt -u nocasematch
fi

used=0
if [ -n "$transcript" ] && [ -f "$transcript" ]; then
  used="$(tail -n 80 "$transcript" 2>/dev/null | jq -rs '
    map(select(.type == "assistant") | .message.usage // empty)
    | last
    | if . == null then 0
      else (.input_tokens // 0) + (.cache_read_input_tokens // 0)
           + (.cache_creation_input_tokens // 0) + (.output_tokens // 0)
      end' 2>/dev/null)"
  [[ "$used" =~ ^[0-9]+$ ]] || used=0
fi

[ "$cap" -le 0 ] && cap=200000

pct=$(( used * 100 / cap ))
[ "$pct" -gt 100 ] && pct=100

width=20
filled=$(( used * width / cap ))
[ "$filled" -gt "$width" ] && filled=$width
[ "$filled" -lt 0 ] && filled=0
empties=$(( width - filled ))

if   [ "$pct" -lt 60 ]; then color="${esc}[32m"
elif [ "$pct" -lt 85 ]; then color="${esc}[33m"
else                         color="${esc}[31m"
fi

bar=""
for ((i = 0; i < filled; i++)); do bar="${bar}█"; done
empty=""
for ((i = 0; i < empties; i++)); do empty="${empty}░"; done
bar="$(printf '%b' "${color}${bar}${dim}${empty}${reset}")"

fmt() {
  local n=$1
  if [ "$n" -ge 1000000 ]; then
    LC_ALL=C awk -v n="$n" 'BEGIN { s = sprintf("%.1f", n / 1000000); sub(/\.0$/, "", s); printf "%sM", s }'
  elif [ "$n" -ge 1000 ]; then
    awk -v n="$n" 'BEGIN { printf "%dk", int(n / 1000 + 0.5) }'
  else
    printf '%s' "$n"
  fi
}
used_txt="$(fmt "$used")"
cap_txt="$(fmt "$cap")"

printf '%s %s%s%%%s %s%s/%s%s %s·%s %s%s%s' \
  "$bar" "$color" "$pct" "$reset" \
  "$dim" "$used_txt" "$cap_txt" "$reset" \
  "$dim" "$reset" "$folder" "$(terse_badge)" "$(frontier_badge)"
