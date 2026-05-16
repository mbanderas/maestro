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

have_jq=0
command -v jq >/dev/null 2>&1 && have_jq=1

# Resolve folder name early -- shown even when the bar is disabled.
cwd=""
[ "$have_jq" -eq 1 ] && cwd="$(printf '%s' "$input" | jq -r '.workspace.current_dir // .cwd // empty')"
folder="?"
[ -n "$cwd" ] && folder="$(basename "$cwd")"

# Disabled via flag file, or jq missing -> show folder name only.
if [ -f "$script_dir/.context-bar-disabled" ] || [ "$have_jq" -eq 0 ]; then
  printf '%s%s%s' "$dim" "$folder" "$reset"
  exit 0
fi

transcript="$(printf '%s' "$input" | jq -r '.transcript_path // empty')"
model_id="$(printf '%s' "$input" | jq -r '.model.id // empty')"

# Model context-window cap.
cap=200000
shopt -s nocasematch
case "$model_id" in
  *1m*|*"[1m]"*) cap=1000000 ;;
  *opus-4-7*)    cap=1000000 ;;
  *)             cap=200000 ;;
esac
shopt -u nocasematch

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
    awk -v n="$n" 'BEGIN { printf "%.2fM", n / 1000000 }'
  elif [ "$n" -ge 1000 ]; then
    awk -v n="$n" 'BEGIN { printf "%dk", int(n / 1000 + 0.5) }'
  else
    printf '%s' "$n"
  fi
}
used_txt="$(fmt "$used")"
cap_txt="$(fmt "$cap")"

printf '%s %s%s%%%s %s%s/%s%s %s·%s %s' \
  "$bar" "$color" "$pct" "$reset" \
  "$dim" "$used_txt" "$cap_txt" "$reset" \
  "$dim" "$reset" "$folder"
