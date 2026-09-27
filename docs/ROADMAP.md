# Roadmap

Working notes on what to do next. Kept short on purpose; update as items land.

## Done so far

- Auth: email/password, sessions, password reset, invitations with in-app dialog
- Projects, members (owner/member), app groups (same product across platforms)
- Integrations: App Store Connect, Google Play, Translation (Anthropic Opus, DeepSeek, DeepL)
- Apps and store versions with state, synced per app
- Release notes: pull, edit, copy from another release, translate, push (both stores)
- Screenshots: pull, upload, delete, drag-to-reorder, push (both stores)

## Next, in order

### 1. Hardening pass, then deploy

- Exercise the three write paths that have never run against real stores:
  push screenshots to App Store Connect, push notes to Google Play, a real translation.
  Do it on a safe release; fix whatever surfaces.
- Deployed: https://planner.spectron.dev runs on the VPS from the GitHub pipeline
  (2026-09-27). See deployment/README.md. The image runs the API from TypeScript source via
  tsx (627 MB); slimming it is optional.
- CI and deploy: done (see deployment/README.md). GitHub Actions runs Biome, typecheck and
  tests on PRs; main builds the image to GHCR and deploys over SSH.

### 2. Store listing metadata

Title, subtitle, description, keywords, promotional text per locale, with pull, edit, copy,
translate and push for both stores. Same tables and UI patterns as release notes; one more
tab under Stores.

### 3. Drive releases from Planner

Create the next version in App Store Connect and the next release on a Play track from the
Releases tab. Later: submit for review and watch the state change.

### 4. Smaller items

- Rename app groups on Overview (endpoint exists, no UI)
- Ownership transfer and roles beyond owner/member
- S3 storage backend behind the existing `Storage` interface
- Org Overview page (currently empty)

### 5. Later

- Analytics from both stores
- Periodic background sync instead of manual buttons
- Email verification and login rate limiting before opening registration beyond the team
- Google Play app discovery via the reporting bucket (no list-apps API exists)
