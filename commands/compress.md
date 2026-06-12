---
description: Compress a natural-language memory file into terse format to cut input tokens (backup kept, deterministic validation)
argument-hint: <filepath>
allowed-tools: Bash, Read
---

Compress a natural-language memory file (CLAUDE.md, todos, notes)
into terse format. Input-token savings compound every turn the file
is loaded (AGENTS.md S8: persistent files are token cost).

Target file: `$ARGUMENTS`

Steps:

1. If no filepath was given, ask for one and stop.
2. Run:

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/compress.cjs" <filepath>
   ```

3. Report the script's outcome to the user verbatim (chars saved,
   backup location, or the refusal/abort reason).

The script is self-contained and enforces its own guardrails — do
not work around a refusal by editing or renaming files:

- Sensitive-path denylist (.env, credentials, keys, .ssh/.aws paths,
  token-ish names): hard refusal — compression sends file contents
  to the Anthropic API.
- Only .md/.txt/extensionless prose files; max 500 KB.
- Original saved as `<name>.original.md`; aborts if that backup
  already exists.
- Deterministic validation (headings, byte-exact code blocks, URLs;
  paths and bullet counts as warnings) with up to 2 cherry-pick fix
  rounds; on persistent failure the original is restored untouched.
