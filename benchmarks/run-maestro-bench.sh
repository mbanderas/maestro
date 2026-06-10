#!/usr/bin/env bash
# Maestro benchmark runner (macOS / Linux). Requires jq (same as the
# Maestro context bar). Runs each task in two cells: Maestro ON
# (AGENTS.md + CLAUDE.md in the work dir) vs OFF (doctrine absent), via
# `claude -p`, inside an isolated CLAUDE_CONFIG_DIR so global ~/.claude
# config (which may itself contain Maestro) cannot contaminate either cell.
#
# Usage:
#   ./run-maestro-bench.sh                       # all tasks, both modes, 1 run
#   ./run-maestro-bench.sh -t t01-fix-inclusive-range -m on -r 3 -M sonnet
set -euo pipefail

MODE="both"; RUNS=1; MODEL="sonnet"; BUDGET="1.0"; TASKS=""; KEEP=0
while getopts "t:m:r:M:b:k" opt; do
  case "$opt" in
    t) TASKS="$OPTARG" ;;
    m) MODE="$OPTARG" ;;
    r) RUNS="$OPTARG" ;;
    M) MODEL="$OPTARG" ;;
    b) BUDGET="$OPTARG" ;;
    k) KEEP=1 ;;
    *) echo "usage: $0 [-t task1,task2] [-m on|off|both] [-r runs] [-M model] [-b budget_usd] [-k]"; exit 2 ;;
  esac
done

command -v jq >/dev/null || { echo "jq is required (https://jqlang.github.io/jq/)"; exit 1; }
command -v claude >/dev/null || { echo "claude CLI not found"; exit 1; }

BENCH_ROOT="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(dirname "$BENCH_ROOT")"
WORK_ROOT="${TMPDIR:-/tmp}/maestro-bench"
CFG_DIR="$WORK_ROOT/config"
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT_FILE="$BENCH_ROOT/results/$STAMP-claude-$MODEL.json"

mkdir -p "$CFG_DIR" "$BENCH_ROOT/results"
if [ -f "$HOME/.claude/.credentials.json" ]; then
  cp "$HOME/.claude/.credentials.json" "$CFG_DIR/"
elif [ -z "${ANTHROPIC_API_KEY:-}" ]; then
  echo "No ~/.claude/.credentials.json and no ANTHROPIC_API_KEY - cannot authenticate isolated runs."; exit 1
fi
echo '{}' > "$CFG_DIR/settings.json"

if [ -n "$TASKS" ]; then
  TASK_DIRS=$(echo "$TASKS" | tr ',' '\n' | while read -r t; do echo "$BENCH_ROOT/tasks/$t"; done)
else
  TASK_DIRS=$(find "$BENCH_ROOT/tasks" -mindepth 1 -maxdepth 1 -type d | sort)
fi
case "$MODE" in
  both) MODES="off on" ;;
  on|off) MODES="$MODE" ;;
  *) echo "invalid mode: $MODE"; exit 2 ;;
esac

ROWS="[]"
for TASK_DIR in $TASK_DIRS; do
  [ -d "$TASK_DIR" ] || { echo "no such task: $TASK_DIR"; exit 1; }
  ID=$(jq -r .id "$TASK_DIR/task.json")
  CATEGORY=$(jq -r .category "$TASK_DIR/task.json")
  PROMPT=$(jq -r .prompt "$TASK_DIR/task.json")
  for RUN_MODE in $MODES; do
    for N in $(seq 1 "$RUNS"); do
      WORK_DIR="$WORK_ROOT/$ID-$RUN_MODE-r$N-$STAMP"
      rm -rf "$WORK_DIR"; mkdir -p "$WORK_DIR"
      cp -R "$TASK_DIR/fixture/." "$WORK_DIR/"
      if [ "$RUN_MODE" = "on" ]; then
        cp "$REPO_ROOT/AGENTS.md" "$REPO_ROOT/CLAUDE.md" "$WORK_DIR/"
      fi

      printf '[%s] mode=%s run=%s model=%s ...' "$ID" "$RUN_MODE" "$N" "$MODEL"
      START_MS=$(($(date +%s%N) / 1000000))
      RAW=$(cd "$WORK_DIR" && CLAUDE_CONFIG_DIR="$CFG_DIR" claude -p "$PROMPT" \
        --model "$MODEL" --output-format json --strict-mcp-config \
        --no-session-persistence --max-budget-usd "$BUDGET" \
        --dangerously-skip-permissions < /dev/null 2>/dev/null) || RAW=""
      WALL_MS=$((($(date +%s%N) / 1000000) - START_MS))

      # Oracle stays hidden during the run: verify.cjs lands only after the
      # agent finishes (visible tests inflate pass rates 20-60%, FeatureBench).
      cp "$TASK_DIR/verify.cjs" "$WORK_DIR/"
      if (cd "$WORK_DIR" && node verify.cjs >/dev/null 2>&1); then PASS=true; else PASS=false; fi

      ROW=$(echo "${RAW:-null}" | jq -c --arg task "$ID" --arg cat "$CATEGORY" \
        --arg mode "$RUN_MODE" --arg model "$MODEL" \
        --argjson run "$N" --argjson pass "$PASS" --argjson wall "$WALL_MS" '{
          task: $task, category: $cat, cli: "claude", model: $model,
          mode: $mode, run: $run, pass: $pass, wall_ms: $wall,
          agent_ms: (.duration_ms // null), num_turns: (.num_turns // null),
          cost_usd: (.total_cost_usd // null),
          in_tokens: (.usage.input_tokens // null),
          out_tokens: (.usage.output_tokens // null),
          cache_read: (.usage.cache_read_input_tokens // null),
          cache_write: (.usage.cache_creation_input_tokens // null),
          is_error: (.is_error // true)
        }')
      ROWS=$(echo "$ROWS" | jq -c --argjson row "$ROW" '. + [$row]')
      echo " $([ "$PASS" = true ] && echo PASS || echo FAIL) | ${WALL_MS} ms"

      [ "$KEEP" = 1 ] || rm -rf "$WORK_DIR"
    done
  done
done

echo "$ROWS" | jq . > "$OUT_FILE"
echo
echo "Results written: $OUT_FILE"
echo "$ROWS" | jq -r '(["task","mode","run","pass","wall_ms","turns","cost_usd"] | @tsv), (.[] | [.task, .mode, .run, .pass, .wall_ms, .num_turns, .cost_usd] | @tsv)' | column -t
