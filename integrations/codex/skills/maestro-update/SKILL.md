---
name: maestro-update
description: Update Maestro to the latest version by re-running the installer for Codex
---

Update **Maestro** to the latest marketplace code. This re-runs the installer,
which pulls the current release and refreshes Maestro-owned files in place.

When the user invokes this skill, run the installer from the repo root:

```bash
npx github:mbanderas/maestro install --target codex
```

The installer is idempotent — it is safe to re-run against an existing
installation. It will:

- Pull the latest Maestro source from the repository.
- Refresh Maestro-managed Codex skills, hooks, and settings scaffolding.
- Preserve user-edited Codex skills and print a next step showing which source
  file to compare/merge.
- Migrate older unprefixed Codex skills to compatibility shims when they are
  exact Maestro-managed artifacts; preserve them when user-edited.
- Leave project-local configuration (state files, secrets) untouched.

## Notes

- Requires `node` and `npx` on `PATH`.
- Run from the project root so the installer targets the correct directory.
- After the installer completes, restart the Codex session (or reload the
  project) so updated skills and hooks take effect. If the installer reports a
  preserved user edit, tell the user the exact path and suggested merge source.
- If `npx` is unavailable, clone `https://github.com/mbanderas/maestro`
  manually and follow the repository's install instructions.
