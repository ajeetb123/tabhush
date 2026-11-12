# Tabhush

Hit Start from wherever you are. Tabhush figures out what you're working on, quiets every unrelated app and site until you're done, and shows you where your time went. A desktop app for macOS and Windows; everything is decided and stored on your computer.

## Start here

| You want to… | Read |
|---|---|
| Work on the code (any agent or person) | `AGENTS.md` first, then `DEVELOPMENT.md` |
| Know what's built and what's left | `STATUS.md` |
| Look up a number, list or threshold | `CONSTANTS.md` (mirrored in `packages/core/src/constants.ts`) |
| Know why something works the way it does | `docs/16-open-questions.md` (every owner decision, Q-01 … Q-76) |

```bash
npm install
npm start          # run the app in development mode
npm test
npm run dist       # macOS installers in apps/desktop/release
```

Windows installers are built by GitHub Actions; updates ship from [ajeetb123/tabhush-releases](https://github.com/ajeetb123/tabhush-releases). Details in `DEVELOPMENT.md`.

## Repository

```
apps/desktop       The app (Electron): main process, macOS and Windows helpers, pages
packages/core      Shared logic: constants, classifier, sessions, inference, privacy
apps/backend       Cloudflare Worker (not deployed; the app runs fully on device)
scripts/           Build, check and release scripts
docs/              The spec, plus docs/business (privacy policy draft, competitive sweep)
                   and docs/history (the Chrome extension Tabhush replaced; original/ has the
                   first scope PDF and spec pack)
```

## The spec

The spec pack started from "Lock-in App: Full Product Scope" (Oct 31, 2026, @Ajeet; `docs/history/original/`) as a Chrome extension; the owner has since moved the product to a desktop app (Q-70, Q-71). Precedence when two places disagree: `CONSTANTS.md`, then the topic doc in `docs/`, then this README. Newer owner decisions in `docs/16-open-questions.md` override older text.

Reading order: `AGENTS.md` (rules, invariants), `docs/02-glossary.md`, `CONSTANTS.md`, the topic doc for your area, `docs/16-open-questions.md` before you assume anything.

```
docs/01-product.md                     What it is, positioning, audience, pillars
docs/02-glossary.md                    Definitions
docs/03-core-loop.md                   Start > infer > sweep > judge > end, breaks, lifecycle
docs/04-locking-and-exits.md           Never-locked list, exit ladder, bypass, fail-open
docs/05-classifier.md                  3 tiers, task registry, labels, memory, thresholds, inference, cache
docs/06-privacy-data-contract.md       What stays, what's sent, redaction, consent, telemetry, age
docs/07-extension.md                   The original Chrome extension (history; see docs/history)
docs/08-backend.md                     Workers backend, tier 3 proxy, abuse limits, config, licenses
docs/09-log-and-ui.md                  Report screens, time definitions, style (UI-06, Q-73)
docs/10-business-and-licensing.md      Free vs Pro, pricing, founding plan, refunds, keys, costs
docs/11-desktop-app.md                 The desktop app (now the product, Q-70)
docs/12-vscode-companion.md            Planned coding-time companion
docs/13-release-scope.md               Original timeline, what ships in each phase, Later, Out
docs/14-metrics-and-gates.md           Wrong-park math, catch rate, Gates 0/A/B/P/C
docs/15-quality-security-testing.md    Test matrix, regression set, red team, perf budgets
docs/16-open-questions.md              Every decision and everything still undecided
```

Tags used in the spec: `[START]` tune later, `[DERIVED]` technical consequence of scope, `[OPEN Q-nn]` undecided, `[vX]` release. Details in `AGENTS.md` section 3.
