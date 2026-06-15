Maestro update — refresh the portable Maestro files in this repository to the latest committed code.

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
curl -O https://raw.githubusercontent.com/mbanderas/maestro/main/.cursorrules
curl -O https://raw.githubusercontent.com/mbanderas/maestro/main/frontier/cli.cjs
# Re-copy the Cursor command files you installed:
#   integrations/cursor/commands/frontier.md -> .cursor/commands/frontier.md
#   integrations/cursor/commands/update.md   -> .cursor/commands/update.md
```

After updating, run `node frontier/cli.cjs status` to confirm the engine is present.

Report what was refreshed and note any errors.

Do not edit any other files.
