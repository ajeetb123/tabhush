# Implementation status: beta 1

Current phase: **beta 1** (`docs/13-release-scope.md`). Nothing from beta 2 or later is built, with the small exceptions listed at the end.

## Beta 1 items

| Scope item | State | Notes |
|---|---|---|
| Start from the toolbar (and shortcut) | Built | LOOP-01. No default key: users assign one. |
| Task inference from open tabs, registry, prototypes | Built | CLS-30..33, CLS-50 with Q-51/Q-53 answers. "Same as X?" word-overlap rule waits on Q-59. |
| Sweep with Confirm for the first 5 sessions, 30 s undo | Built | LOOP-04. Auto-commit for session 6+ stays off until Q-16(a). Preview shows every group until Q-17. |
| Overlay with mute and pause | Built | INV-17, EXT-07, QA-30. |
| Blocking for distraction domains | Built | DNR redirect to a local page with the override form (LOOP-09, CLS-55). |
| Show-then-judge | Built | Pages load, then get overlaid. |
| Tier 1, zero-label similarity, tier 3 via backend, verdict cache | Built; tier 3 **off by owner decision** (Q-61) | Every install is on-device only. The CLS-21 on-device parking path moved into beta 1 and parks low-similarity pages in the UT1 games, social, shopping and entertainment lists (Q-08). Overrides without an LLM are accepted and logged (Q-38). |
| Domain-only sites | Partial | Webmail, web chat and UT1 banking domains (Q-48) send nothing but the domain; no health list yet. |
| Full never-locked list | Partial | Courseware, meetings, GitHub, localhost, browser pages done. School-hosted courseware (Q-10), package registries (Q-11), school sign-in pages (Q-56) open. Domains need owner check (Q-57). |
| Consent before the first tier 3 call | Built, not shown | Nothing is sent while the LLM is off (Q-61). |
| Privacy policy | Draft | `docs/privacy-policy-draft.md`, OpenAI retention terms checked 2026-10-31. Legal name, contact, lawful basis and telemetry retention (Q-25) are for the owner. |
| Basic telemetry | Built, not sent | PRIV-30 allowlist on both ends. The client has no backend host (Q-26). Retention Q-25. |
| Sampled "Was this park right?" check | Built, gated | Overlay question and review record are in place; the sample rate is Q-42, so nothing is sampled yet. |
| Exit ladder: override, End | Built | Without tier 3 an override is accepted for the session and logged as "not checked" (Q-38). |
| Review export, refused-override logging | Logging built, export gated | Format Q-28. |

## Owner changes after the first real run (Q-63, 2026-11-01)

No questions, no override, no undo; End has a 30-second countdown. Clear distractions (pure-distraction list, low-scoring UT1 games/social/shopping/video pages, UT1 warez and `streameast` hosts) are blocked; everything else stays open. Claude, ChatGPT, Blender and Stack Overflow are always allowed; YouTube browsing is allowed and videos are judged; music (Spotify, YouTube Music, YouTube videos labelled Music) plays at 30%. A session can cover several tasks. All pages and the overlay were redesigned.

## Owner changes, round 2 (Q-64, 2026-11-01)

No prompts at Start: tasks come from recent tasks or are named on device from the tabs (course codes first), near-duplicates merge silently, and one start screen holds task chips (typed, or spoken when Chrome offers on-device speech), a time goal and the block list. Course codes are remembered locally, never from incognito or domain-only sites. Searches on Google/Bing/DuckDuckGo are blocked when the query matches a distraction topic (measured: 11/16 distractions, 0/16 work searches). UT1 sports sites are blocked. Past the time goal, Stop ends at once. New logo, icons and a more colorful UI.

## Owner changes, round 3 (Q-65, 2026-11-01)

Piracy and streaming sites that no list has (UT1 misses yarrlist, fmovies, soap2day, hianime and the like) are blocked by what the page is about: title, description and headings read on device, compared with distraction and work topics (measured: 11/12 distraction pages, 0/14 work pages). Embedded players on a blocked page are paused too. Incognito still needs "Allow in Incognito" switched on by the user. A Today / Week / Sessions report with focused time, focus %, blocks, a day strip by task and an insight.

## Pre-launch checklist (2026-11-01)

Built: breaks (earned, automatic re-lock), first-run onboarding with school sites, the privacy policy rewritten for the current build (`docs/privacy-policy-draft.md`), and a Web Store listing draft (`docs/web-store-listing-draft.md`).

Still on the owner:
- Trademark search for "Tabhush", then buy `tabhush.com` (Q-01, Q-26).
- Fill the [OWNER] parts of the privacy policy and host it on the site.
- A real test week to measure wrong blocks (Gate A), on your own browsing.
- Web Store: $5 registration, screenshots, submit unlisted.
- Decide whether usage counts are on by default; set the backend address (Q-26) or leave them off.

## Backend (beta 1 subset)

Install tokens with PoW (Q-06), tier 3 proxy with fixed prompts and strict schema, Free daily cap per UTC day (Q-58), telemetry intake, delete-my-data. Not built: IP rate limits, waves and the global dollar limit (Q-07), remote config (beta 2), licenses (v1), contributions.

## Verified external APIs (2026-10-31)

- `openai@7.47.0`: `gpt-5-nano` is **deprecated, shutdown 2026-12-11**, so the owner chose `gpt-5.4-nano` (Q-60): effort values none/low/medium/high/xhigh, $0.20 / $1.25 per 1M tokens, itself removed **2027-04-01**. Responses API `store` defaults to true, so the proxy sends `store: false`. OpenAI's terms on minors could not be fetched (owner to check).
- SCOWL v1 2020.12.07: MIT-like license with a notice requirement; sizes 10-35 give 49,811 English + American words. SSA `names.zip` refuses automated download (HTTP 403).
- `@huggingface/transformers@4.3.2`: local-only model loading; the jsdelivr default for ONNX Runtime files is overridden and stripped from the bundle.
- Hugging Face `Xenova/all-MiniLM-L6-v2`: `onnx/model_int8.onnx`, 22,972,370 bytes, Apache-2.0, revision pinned.
- `@types/chrome@0.3.7`: `runtime.onUpdateAvailable` installs "the next time the background page gets unloaded", so INV-14 deferral must be checked in a real browser (Q-47).

## Not verified

The extension has not been loaded in a real browser yet; tests run on the shared core, the backend handlers and the content script (happy-dom). The regression set (QA-02), proctoring check (QA-03), red team (QA-20), redaction set (QA-21) and performance budgets (QA-50) need real data, a browser, or both.

## Built ahead of phase

- `POST /v1/delete` (BE-08, listed for v1): the backend already stores beta 1 telemetry, so erasure exists from the start. No UI yet.
- The ask budget (CLS-25) is applied in beta 1 because LOOP-05 says so; phase is Q-55.
