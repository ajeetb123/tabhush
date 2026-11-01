# Development

Read `AGENTS.md` first. The spec pack (`README.md`, `CONSTANTS.md`, `docs/`) is the source of truth; this file only covers how to build and test.

## Layout

```
packages/core      Shared TypeScript: constants module (mirrors CONSTANTS.md), tier 1 lists, classifier
                   decision procedure, cache keys, registry, inference, labels, redaction, wire schemas, PoW
apps/extension     Chrome MV3 extension (Vite): service worker, offscreen tier 2 model, content script, UI pages
apps/backend       Cloudflare Worker: install tokens, tier 3 proxy, telemetry, delete-my-data (D1)
scripts/           check-ship (TODO_Q guard), check-bundle (INV-05 guard), fetch-model (build-time model download)
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
npm run check:bundle -w @lockin/extension
```

```bash
npm run check:ship
```

`check:ship` fails while any `TODO_Q<nn>` placeholder remains in the constants module. That is expected until the open questions in `docs/16-open-questions.md` are answered.

## The on-device model

The model is bundled in the package, never fetched at runtime (INV-05). Before loading the extension, put it in place once (~23 MB, `Xenova/all-MiniLM-L6-v2` at a pinned revision, size-checked):

```bash
npm run fetch-model -w @lockin/extension
```

Then `npm run build` and load `apps/extension/dist` as an unpacked extension in Chrome, Edge or Brave (120+). Without the model, tier 2 is unavailable and every undecided page is allowed and flagged (INV-06).

## Backend

```bash
npx wrangler d1 create lockin
```

Put the returned ID in `apps/backend/wrangler.toml`, then apply `apps/backend/migrations/` and set the key with `wrangler secret put OPENAI_API_KEY`. Logs stay off (INV-18): do not enable Workers Logs or attach Logpush.

Tier 3 cannot run end to end yet: the backend host (Q-26), the redaction dictionaries and patterns (Q-14, Q-15) and the model's reasoning setting (Q-60) are undecided, so the extension keeps tier 3 off.
