# List Maestro in `awesome-codex-plugins`

Checklist for getting **Maestro** (`mbanderas/maestro`) listed in
[`hashgraph-online` **awesome-codex-plugins**](https://github.com/hashgraph-online/awesome-codex-plugins).
Listing is **gated**: a maintainer-run CI validates every PR and the repo must
pass the HOL AI Plugin Scanner. A bare README line will be bounced.

Requested in [mbanderas/maestro#29](https://github.com/mbanderas/maestro/issues/29).

> Adapted from the portable costguard listing-prep guide; placeholders are
> already filled with Maestro's real values (`owner=mbanderas`, `repo=maestro`,
> Plugin Name `Maestro`, brand `#5B82D6`).

---

## The gate (hard requirements)

| Requirement | Threshold |
|-------------|-----------|
| HOL scanner score | **≥ 80 / 130** |
| Findings | **No critical or high severity** |
| Scanner in CI | Workflow must run in `mbanderas/maestro` GitHub Actions (main/master) |
| PR description | Must cite the score or link the passing CI run |

Source of truth: the target repo's `CONTRIBUTING.md` and `SCANNER_GUIDE.md`.
Re-read them before submitting — thresholds and required files drift.

---

## §0 Maestro current state — audited 2026-07-04

What the Maestro repo already has vs. what this listing needs. Re-verify before
acting; the repo moves.

| Item | State | Action |
|------|-------|--------|
| `LICENSE` (MIT) | present | — |
| `README.md` | present | — |
| `.codex-plugin/plugin.json` | present, valid (`name` kebab, `version` semver `1.14.0`, `interface` block, `brandColor` `#5B82D6`, `composerIcon` → `./assets/icon.png`) | done |
| `.github/dependabot.yml` | present | — (Operational Security points banked) |
| `.github/workflows/{ci,publish}.yml` | present, actions SHA-pinned | done (§5) |
| `SECURITY.md` | present | done (§3) |
| Dependency lockfile (`package-lock.json`, npm) | present | done (§1; pnpm N/A — repo is npm) |
| `assets/icon.png` 512² | present (conductor-mascot render, matches banner) | done (§4) |
| `.github/workflows/hol-plugin-scanner.yml` | present (`min_score:80`, SARIF) | done (§6) |
| `.codexignore` | present | done (Best Practices point) |
| `.plugin-scanner.toml` | present (`ignore_paths` for benchmarks + `*.test.cjs`) | done (secret false-positive scoping) |

Net status: **Part A complete.** Remaining: push branch → read scanner CI score
→ merge to `main` → submission PR (Part B).

---

## Part A — Make the plugin repo gate-ready

### 1. Required files at repo root

- [x] `.codex-plugin/plugin.json` — valid manifest, `composerIcon` → `./assets/icon.png` (§2)
- [x] `SECURITY.md` — vulnerability disclosure policy (§3)
- [x] `LICENSE` — MIT — present
- [x] `README.md` — present
- [x] Dependency lockfile — `package-lock.json` (npm); pnpm N/A
- [x] `assets/icon.png` — 512×512, conductor-mascot render, ~99KB (§4)

### 2. `plugin.json` — add the icon

`.codex-plugin/plugin.json` already validates. The one gate-relevant gap is
`interface.composerIcon`: it is **required** and must resolve to a file that
exists. Add it alongside the existing `interface` fields:

```json
{
  "name": "maestro",
  "version": "1.14.0",
  "interface": {
    "displayName": "Maestro",
    "shortDescription": "Frontier orchestration, Codex skills, and lifecycle hooks",
    "brandColor": "#5B82D6",
    "composerIcon": "./assets/icon.png"
  }
}
```

`name` stays kebab-case (`maestro` ✓); `version` stays valid semver
(`1.14.0` ✓). Do not renumber for the listing.

### 3. `SECURITY.md` template

```markdown
# Security Policy

## Reporting a Vulnerability

Please report security vulnerabilities privately. Do not open a public issue.

Open a private security advisory at
https://github.com/mbanderas/maestro/security/advisories/new
(the repository's **Security -> Advisories -> Report a vulnerability** tab).

Include a description + impact, reproduction steps, and affected versions.
Expect an acknowledgement within 5 business days.

## Supported Versions

The latest published release receives security updates.
```

### 4. The 512×512 icon — shipped

`assets/icon.png` (512×512, 8-bit palette PNG, ~99KB, no text). Reuses the
Maestro Frontier banner mascot — the tuxedoed conductor whose device-head shows
a glowing cyan `{ :) }` brace-smile and who raises a gold baton — framed as an
app-icon bust on a solid `#5B82D6` blue squircle. Same 3D glossy-clay render
family and icon framing as the listed **costguard** icon (naval-captain mascot),
so the two read as one publisher family.

Generation: 1254² render → resized to 512² and palette-quantized (`sharp-cli`,
256-color, effort 6). The 16-color/4-bit encoding (≈36KB, matching costguard's)
was rejected — it banded the blue background gradient. No text in the icon
(scanner best-practice; legible at 32×32).

### 5. SHA-pin every GitHub Action

The scanner's Operational Security score rewards commit-pinned actions. In
`ci.yml`, `publish.yml`, and `runner-router-sync.yml`, replace `@vN` tags with
the tag's commit SHA (keep the version in a trailing comment). Resolve a SHA:

```bash
git ls-remote --tags https://github.com/<org>/<action> <tag>
```

```yaml
# before
- uses: actions/checkout@v4
# after
- uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v4.2.2
```

Do this in **all** workflow files. (`publish.yml.bak` is not run by Actions —
delete or ignore it; do not leave a stale unpinned copy that confuses reviewers.)

### 6. Add the scanner workflow

Create `.github/workflows/hol-plugin-scanner.yml`:

```yaml
name: HOL Plugin Scanner

on:
  push:
    branches: [main, master]
  pull_request:
    branches: [main, master]

permissions:
  contents: read
  security-events: write

jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v4.2.2
      - name: HOL Plugin Scanner
        uses: hashgraph-online/ai-plugin-scanner-action@v1
        with:
          plugin_dir: "."
          mode: scan
          min_score: 80
          fail_on_severity: high
          format: sarif
          upload_sarif: true
```

Push to `master`, let it run, and copy the run URL + score for the PR. Note the
repo already routes some CI to a self-hosted runner (`runner-router-sync.yml` /
`HOME_CI`); keep the scanner on `ubuntu-latest` so the maintainers can reproduce.

### 7. Get the score

Easiest path: read it from the scanner CI run above. Local run:

```bash
pipx install plugin-scanner
plugin-scanner scan . --format text
```

> **Windows gotcha:** `pip install plugin-scanner` can fail on the bundled
> `litellm` dependency (path exceeds `MAX_PATH`). Either enable Win32 long
> paths, run it under WSL/Linux, or just rely on the GitHub Actions run for the
> score.

If under 80, the rubric below shows where points live.

---

## Part B — The submission PR to `awesome-codex-plugins`

**README-line-only.** The maintainers' generator derives the plugin bundle,
`plugins.json`, and `marketplace.json` from the linked repo. Do **not**
hand-commit a `plugins/mbanderas/maestro/` bundle or edit `plugins.json` /
`marketplace.json` in the PR — their generator strips/overwrites manual copies
and a bundle-carrying PR gets bounced.

1. **README line** — one sentence, alphabetical within its category section
   (**Development & Workflow** is the fit for Maestro). Match the file's
   existing bullet style:

   ```markdown
   - [Maestro](https://github.com/mbanderas/maestro) - Opt-in local multi-CLI fusion engine and orchestration doctrine that fans a prompt across model CLIs, then judges and synthesizes one grounded answer.
   ```

2. **PR description** — include the scanner score or link the passing
   `hol-plugin-scanner` CI run (from the pushed/merged Maestro repo), and
   reference `mbanderas/maestro#29`.

3. **One plugin per PR.**

Prereq: the Maestro repo must already be on public `main` with the scanner CI
green (Part A) — the generator + maintainer CI scan the linked repo, not the PR.

Flow: fork → branch → add the single README line → open PR. The maintainer's CI
checks alphabetical order, link reachability, and re-runs the scanner against the
linked repo.

---

## Scanner score rubric (130 pts; aim ≥ 80)

| Category | Max | What it checks |
|----------|-----|----------------|
| Manifest Validation | 31 | valid `plugin.json`, required fields, semver, kebab-case |
| Security | 36 | `SECURITY.md`, `LICENSE`, no secrets, hardened MCP remotes |
| Operational Security | 20 | SHA-pinned Actions, no `write-all`, Dependabot, lockfiles |
| Best Practices | 15 | `README.md`, skills dir, `SKILL.md` frontmatter, `.codexignore` |
| Marketplace | 15 | valid `marketplace.json`, safe source paths |
| Skill Security | 15 | clean scan, no elevated findings, analyzable |
| Code Quality | 10 | no `eval`/`new Function`, no shell injection |

Maestro's cheap wins vs. §0: add `SECURITY.md` (Security), SHA-pin actions
(Operational Security — Dependabot already banked), add `.codexignore` (Best
Practices), add lockfile (Operational Security). `codex-skills/` already gives
the skills-dir Best-Practices credit.

---

## Quick checklist

**Plugin repo (Part A — complete locally, unpushed):**
- [x] `LICENSE`, `README.md` present
- [x] `SECURITY.md` present
- [x] lockfile present (`package-lock.json`, npm; pnpm N/A)
- [x] `.codex-plugin/plugin.json` valid
- [x] `interface.composerIcon` set + `assets/icon.png` (512²) exists at that path
- [x] all GitHub Actions SHA-pinned (`ci`, `publish`; `runner-router-sync` has no `uses:`)
- [x] `.codexignore` present
- [ ] `hol-plugin-scanner.yml` present — CI green on `main` + score ≥ 80 pending push
- [ ] no critical/high findings — confirmed by the scanner CI after push

**Submission PR (README-line-only):**
- [ ] README entry, alphabetical, single sentence
- [ ] PR body cites the scanner score / CI run and references #29
- [ ] no hand-committed bundle / `plugins.json` / `marketplace.json` (generator derives them)
