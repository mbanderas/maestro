---
description: Switch Maestro terse output mode (lite|full|ultra|off)
argument-hint: "[lite|full|ultra|off]"
---

Switch the Maestro terse output level. Requested level: `$ARGUMENTS`

The maestro-terse-mode hook already updated the flag file when this
command was submitted (bare invocation activates the configured
default, or `full`). Do not edit the flag yourself.

Steps:

1. Read `${CLAUDE_PLUGIN_ROOT}/skills/terse/SKILL.md` and apply the
   ruleset for the requested level from this response onward
   (`off`: drop terse style entirely).
2. Confirm in one line: new level, how to switch off
   (`/maestro:terse off`, "stop terse", "normal mode"), and that the
   statusline badge shows `[TERSE:<LEVEL>]` next session refresh.

Boundaries (always): code/commits/PRs written normal; Auto-Clarity
escape for security warnings, irreversible-action confirmations, and
multi-step sequences.
