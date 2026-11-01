# 07 Browser extension architecture (v1)

Owner of: extension components, browser APIs, storage, permissions, overlay mechanics, update deferral, incognito, Safari test, Web Store listing.
Behavior: `03`, `04`, `05`. Privacy: `06`. Numbers: `CONSTANTS.md` (PLATFORM, PERF_EXTENSION).

## EXT-01 Target
- **Chrome Manifest V3.** One build for **Chrome, Edge and Brave**, version **120+**, on **macOS and Windows**.
- Edge users install from the Chrome Web Store; an Edge Add-ons listing is optional.
- No Safari in v1 (ships inside the Mac app in v1.5). No Firefox (Later).
- Language and build tooling: **TypeScript (strict) + Vite** multi-entry build; Vitest for tests (Q-02, resolved 2026-10-31).

## EXT-02 Components [DERIVED module map; names are implementation choices]

```
┌─────────────────────────── Extension ────────────────────────────┐
│ Service worker (background)                                       │
│   session engine + state machine (03) · persisted on every change │
│   tab / window / tab-group events · in-page navigation events     │
│   tier 1 rules · verdict cache · ask budget · task registry access│
│   pre-block rule management · mute/unmute tabs                    │
│   remote config fetch + signature verify · backend client         │
│   heartbeat writer · update deferral · idle state                 │
│                                                                   │
│ Offscreen document                                                │
│   tier 2: Transformers.js + ONNX Runtime Web (WASM, bundled)      │
│   MiniLM int8 embedding · personal memory kNN                     │
│                                                                   │
│ Content script (every page)                                       │
│   lock overlay (accessible) · re-add if removed                   │
│   pause media on every play event (incl. PiP, media keys)         │
│   input activity COUNTS (no content) for active time & labels     │
│   courseware page-fingerprint check (OPEN Q-10)                   │
│                                                                   │
│ UI pages                                                          │
│   popup (current session) · full-page log (Today/Week/Sessions)   │
│   onboarding · sweep preview · clarify prompt · consent screen    │
│   settings · restore list / session card                          │
│                                                                   │
│ Storage: IndexedDB (large) · chrome.storage (small settings)      │
└───────────────────────────────────────────────────────────────────┘
          │ HTTPS (tier 3, config, license, telemetry, contributions)
          ▼
       Backend (08)
```

## EXT-03 Browser APIs [DERIVED; verify each against current Chrome docs before use]

Use only what is needed; every permission affects Web Store review and the install warning.

```
chrome.tabs              titles, URLs, muting, closing, active tab
chrome.windows           window structure (separate contexts)
chrome.tabGroups         tab-group structure (separate contexts)
chrome.webNavigation     in-page (history state) navigations → re-judge SPAs
chrome.declarativeNetRequest   pre-block known distraction domains before load
chrome.offscreen         host for the WASM model (service worker can sleep)
chrome.idle              idle state (no permission prompt) for idle pause/end and active time
chrome.storage           small settings; heartbeat
chrome.commands          Start keyboard shortcut
chrome.scripting         content script injection
chrome.runtime           update events (defer), messaging; native messaging from v1.5
chrome.alarms            timers that survive service-worker suspension
host permissions         <all_urls> (required; triggers the warning and in-depth review)
```
If any listed API behaves differently in the installed Chrome version, report it; do not emulate.

## EXT-04 Storage
- **IndexedDB:** embeddings, labels, personal memory, task registry, sessions, time logs, verdict cache, review records.
- **chrome.storage:** small settings, heartbeat, install token, license key status.
- chrome.storage.local caps at 10 MB without `unlimitedStorage`; do not put large data there.
- Total budget: **< 50 MB per user**.
- Session state must be persisted on every transition so it survives service-worker suspension, restart, sleep and crash (`03` LOOP-11).

## EXT-05 Remote code ban
- Model weights and the WASM runtime are **bundled in the package**.
- Never `eval`, `new Function`, or load scripts from the network.
- The remote config is **data only**, verified with its signature before use (INV-05). Invalid signature → keep last valid config [DERIVED].

## EXT-06 Show-then-judge implementation
- Pre-block rules (declarativeNetRequest) installed at Start for known pure-distraction domains and cached distraction verdicts.
- A named mixed site in the task lifts only its domain-wide pre-block rule.
- All other pages load normally; the content script shows the overlay as soon as a park verdict arrives. Never blank the page while waiting.
- Re-judge on every in-page navigation and on tab restore.

## EXT-07 Overlay
- Covers the page; does not navigate, reload or unload it (page state preserved, INV-17).
- Tab muted; media paused and re-paused on every `play` event.
- "Background audio OK" setting: no mute/pause for background tabs while the page stays locked.
- Shows the exit ladder entry points (override, emergency pass) and the task.
- If the overlay node is removed (DevTools), it is re-added and an escape is logged.
- Accessibility: screen-reader labels, full keyboard control, reduced-motion support (`15` QA-30).
- Reader mode and embeds of a parked site on other pages are judged as that site.

## EXT-08 Unreachable pages
Pages a content script can't reach (Chrome Web Store, built-in PDF viewer, other browser-internal pages) that are judged unrelated are **closed and added to the restore list**.

## EXT-09 Heartbeat and gaps
- Write a heartbeat timestamp to storage periodically during a session [interval OPEN Q-18].
- On startup/enable during a session, a heartbeat gap beyond the threshold is logged as a gap.

## EXT-10 Update deferral
- An update arriving mid-session waits until the session ends (INV-14). Apply only after End [DERIVED: listen for the update-available event and delay reload].
- Behavior when the browser itself restarts and applies the update: verify and document [OPEN Q-47].

## EXT-11 Incognito
Onboarding asks for incognito access and shows its status. Without it, incognito is unprotected in v1.

## EXT-12 Onboarding [beta2]
- Install warning explainer (pre-install screen, also on the site).
- School (for school-hosted courseware domains).
- Optional essentials list.
- Incognito access prompt.
- Self-declared age.
- Consent screen before first tier 3 call (may be deferred until the first tier 3 need [DERIVED]).
- License key entry for Pro.

## EXT-13 Safari test (setup week, 2 hours)
- Apple's converter wraps the extension in a minimal Mac app; it will probably run.
- **Pass criterion:** tier 2 runs in Safari's extension background (no offscreen API there) and judges a title in **< 50 ms warm**.
- Outcome decides only **where classification runs** for Safari: in the extension, or in the Mac app's classifier helper (part of the app's free mode).
- Either way the Safari extension ships **inside the Mac app (v1.5)**. AppleScript is dropped.

## EXT-14 Web Store listing
- Single purpose (verbatim): "Blocks sites unrelated to your current work session and tracks time spent on it."
- User-data disclosure matching `06`.
- Broad host access triggers in-depth review: submit the **unlisted** listing over **winter break**, well before beta 2 needs it.

## EXT-15 Performance budget [START]
No measurable CPU when idle; < 150 MB memory including the model; tier 1 + tier 2 verdicts < 100 ms; tier 3 < 1.5 s p95; 30 most recent tabs judged within 2 s of Start with 80+ open; < 50 MB storage.

## Acceptance criteria
- [ ] Same package installs and passes the regression set on Chrome, Edge, Brave × macOS, Windows.
- [ ] Killing the service worker mid-session loses no state.
- [ ] No network request fetches executable code or model weights.
- [ ] Netflix is blocked before render at Start; an unrelated non-distraction page renders, then is overlaid.
- [ ] Overlay deleted via DevTools is restored within one judge cycle and an escape is logged.
- [ ] Performance budgets met on the test matrix (`15`).
