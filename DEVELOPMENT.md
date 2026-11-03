# Development

Read `AGENTS.md` first. The spec pack (`README.md`, `CONSTANTS.md`, `docs/`) is the source of truth; this file only covers how to build and test.

## Layout

```
packages/core          Shared TypeScript: constants module (mirrors CONSTANTS.md), tier 1 lists, classifier
                       decision procedure, cache keys, registry, inference, session state machine, redaction
apps/desktop           The Tabhush app (Electron, Q-70/Q-71)
  src/main             Main process: engine (sessions, tracking, blocking), classifier wiring, activity log,
                       OS-helper client, updater
  src/renderer         Pages (session, report, settings) and the hidden classifier window (Vite)
  src/shared           Types shared by main and pages
  native               OS helpers: helper.swift (macOS), helper-win.ps1 (Windows, PowerShell + C# 5)
  test                 Engine tests against a fake OS layer (fakes.ts)
apps/backend           Cloudflare Worker: install tokens, tier 3 proxy, telemetry, delete-my-data (D1); not deployed
scripts/               check-ship (TODO_Q guard), check-bundle (INV-05 guard), fetch-model, build-categories,
                       build-lexicons, make-icons, release-win (publish a Windows update)
docs/                  The spec (01-16); docs/business: privacy policy draft, competitive sweep;
                       docs/history: the removed extension's status
```

## Commands

```bash
npm install
```

```bash
npm test
```

```bash
npm run typecheck
```

```bash
npm run build
```

```bash
npm start
```

`npm start` builds and opens the app in development mode. A development build can always end a session and quit (Q-69, Q-70); a packaged build can't while a session is locked.

```bash
npm run dist
```

`npm run dist` (macOS) makes `apps/desktop/release/Tabhush-<version>-arm64.dmg` (Apple Silicon) and `-x64.dmg` (Intel). They are ad-hoc signed, not notarized: open the app the first time with right-click → Open. It needs Xcode's command line tools (`swiftc`) for the helper.

```bash
npm run check:bundle
```

**Windows (Q-71):** the Windows installer is built by GitHub Actions on every push that touches the app (`.github/workflows/windows.yml`), or by hand from the Actions tab ("windows" → Run workflow). Download `Tabhush-Windows` from the run's artifacts. On a Windows PC, `npm run dist:win -w @tabhush/desktop` builds it locally.

```bash
npm run check:ship
```

`check:ship` fails while any `TODO_Q<nn>` placeholder remains in the constants module. That is expected until the open questions in `docs/16-open-questions.md` are answered.

## The on-device model

The model is bundled in the package, never fetched at runtime (INV-05). Before building the app, put it in place once (~23 MB, `Xenova/all-MiniLM-L6-v2` at a pinned revision, size-checked):

```bash
npm run fetch-model -w @tabhush/desktop
```

To see the model's label scores for your own examples (useful for Gate A):

```bash
node scripts/model-smoke.mjs "Lab report chemistry" "Titration lab report draft docs.google.com"
```

The redaction lists (Q-14) are built into the package too. Download the SSA national baby-names file `names.zip` by hand from ssa.gov (it refuses scripted downloads); the script fetches SCOWL from SourceForge:

```bash
npm run build-lexicons -w @tabhush/desktop -- --names ~/Downloads/names.zip
```

The site-category and banking lists (Q-08, Q-48) come from the UT1 blacklists mirror at a pinned commit (about 1.3 MB):

```bash
npm run build-categories -w @tabhush/desktop
```

Then `npm start`. Without the model, tier 2 is unavailable and every undecided page is allowed and flagged (INV-06).

## Backend

```bash
npx wrangler d1 create tabhush
```

Put the returned ID in `apps/backend/wrangler.toml`, then apply `apps/backend/migrations/` and set the key with `wrangler secret put OPENAI_API_KEY`. Logs stay off (INV-18): do not enable Workers Logs or attach Logpush.

Tier 3 cannot run end to end yet: `API.BASE_URL` stays `TODO_Q26` until the workers.dev subdomain is known (`https://tabhush-backend.<subdomain>.workers.dev`). Without the redaction lists in the package, tier 3 also stays off.
