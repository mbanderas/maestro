---
name: update
description: Update Maestro to the latest version by re-running the installer for Codex
---

Update **Maestro** to the latest marketplace code. This re-runs the installer,
which pulls the current release and overwrites the local Maestro files in place.

When the user invokes this skill, run the installer from the repo root:

```bash
npx github:mbanderas/maestro install --target codex
```

The installer is idempotent — it is safe to re-run against an existing
installation. It will:

- Pull the latest Maestro source from the repository.
- Overwrite skills, hooks, and settings scaffolding with the new versions.
- Leave project-local configuration (state files, secrets) untouched.

## Notes

- Requires `node` and `npx` on `PATH`.
- Run from the project root so the installer targets the correct directory.
- After the installer completes, restart the Codex session (or reload the
  project) so updated skills and hooks take effect.
- If `npx` is unavailable, clone `https://github.com/mbanderas/maestro`
  manually and follow the repository's install instructions.
