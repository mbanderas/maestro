---
description: Update Maestro portable files to the latest committed code
argument-hint: ""
---

Refresh the Maestro portable install in this repository to the latest committed
code from <https://github.com/mbanderas/maestro>.

Maestro has no version pin for portable installs — fetching the latest `main`
always resolves the newest committed code.

**If this repo contains a git clone of the Maestro source**, run:

```bash
git -C <path-to-maestro-clone> pull
```

Then re-copy `frontier/` and any integration command files you use into this project.

**If you downloaded and copied files manually** (no clone), re-fetch and re-copy
from latest `main`:

```bash
curl -O https://raw.githubusercontent.com/mbanderas/maestro/main/AGENTS.md
curl -O https://raw.githubusercontent.com/mbanderas/maestro/main/frontier/cli.cjs
curl -O https://raw.githubusercontent.com/mbanderas/maestro/main/bin/maestro.cjs
# Re-copy any integration command files you installed:
#   integrations/codex/skills/maestro/SKILL.md          -> ~/.agents/skills/maestro/SKILL.md
#   integrations/codex/skills/maestro-frontier/SKILL.md -> ~/.agents/skills/maestro-frontier/SKILL.md
#   integrations/codex/skills/maestro-settings/SKILL.md -> ~/.agents/skills/maestro-settings/SKILL.md
#   integrations/codex/skills/maestro-terse/SKILL.md    -> ~/.agents/skills/maestro-terse/SKILL.md
#   integrations/codex/skills/maestro-update/SKILL.md   -> ~/.agents/skills/maestro-update/SKILL.md
```

After updating, run `node bin/maestro.cjs frontier status` to confirm the engine is present.
For Codex skills, managed Maestro copies refresh automatically, user-edited
copies are preserved with next-step output, and older exact unprefixed Maestro
skills may be migrated to compatibility shims.
The current Codex command path is the `/maestro` skill hub plus specialized
skill entries, not `/prompts:*`.

Report what was refreshed and note any errors.

Do not edit any other files.
