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
| Tier 1, zero-label similarity, tier 3 via backend, verdict cache | Built, tier 3 gated | Tier 3 is off until Q-14/Q-15 (redaction), Q-26 (backend host) and Q-60 (model setting) are answered. |
| Full never-locked list | Partial | Courseware, meetings, GitHub, localhost, browser pages done. School-hosted courseware (Q-10), package registries (Q-11), school sign-in pages (Q-56) open. Domains need owner check (Q-57). |
| Consent before the first tier 3 call | Built | PRIV-60, INV-10. |
| Privacy policy | Draft | `docs/privacy-policy-draft.md`, OpenAI retention terms checked 2026-10-31. Legal name, contact, lawful basis and telemetry retention (Q-25) are for the owner. |
| Basic telemetry | Built, not sent | PRIV-30 allowlist on both ends. The client has no backend host (Q-26). Retention Q-25. |
| Sampled "Was this park right?" check | Built, gated | Overlay question and review record are in place; the sample rate is Q-42, so nothing is sampled yet. |
| Exit ladder: override, End | Built | Override outcome when tier 3 is unsure/unavailable is Q-38: the item stays parked. |
| Review export, refused-override logging | Logging built, export gated | Format Q-28. |

## Backend (beta 1 subset)

Install tokens with PoW (Q-06), tier 3 proxy with fixed prompts and strict schema, Free daily cap per UTC day (Q-58), telemetry intake, delete-my-data. Not built: IP rate limits, waves and the global dollar limit (Q-07), remote config (beta 2), licenses (v1), contributions.

## Verified external APIs (2026-10-31)

- `openai@7.47.0`: `gpt-5-nano` exists but is **deprecated, shutdown 2026-12-11** (Q-60). Responses API `store` defaults to true, so the proxy sends `store: false`.
- `@huggingface/transformers@4.3.2`: local-only model loading; the jsdelivr default for ONNX Runtime files is overridden and stripped from the bundle.
- Hugging Face `Xenova/all-MiniLM-L6-v2`: `onnx/model_int8.onnx`, 22,972,370 bytes, Apache-2.0, revision pinned.
- `@types/chrome@0.3.7`: `runtime.onUpdateAvailable` installs "the next time the background page gets unloaded", so INV-14 deferral must be checked in a real browser (Q-47).

## Not verified

The extension has not been loaded in a real browser yet; tests run on the shared core, the backend handlers and the content script (happy-dom). The regression set (QA-02), proctoring check (QA-03), red team (QA-20), redaction set (QA-21) and performance budgets (QA-50) need real data, a browser, or both.

## Built ahead of phase

- `POST /v1/delete` (BE-08, listed for v1): the backend already stores beta 1 telemetry, so erasure exists from the start. No UI yet.
- The ask budget (CLS-25) is applied in beta 1 because LOOP-05 says so; phase is Q-55.
