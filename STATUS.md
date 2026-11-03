# Status

What is built, what isn't, and what's left for the owner. Updated 2026-11-02. The product is the Tabhush desktop app (`apps/desktop`) for macOS and Windows; the Chrome extension it replaced is described in `docs/history/extension-status.md`.

## The app

| Area | State | Notes |
|---|---|---|
| Menu-bar / tray app, open at login, Session · Report · Settings window | Built | DSK-30. Calm Aurora design with motion (Q-73). |
| Tracking: front app, window title, browser site and page | Built | All day by default; stays on the computer. macOS titles need Accessibility (Q-70). Idle minutes are taken back out of the log (Q-74). |
| Start: one task named from what's open, time goal, what gets blocked, Lock in | Built | CLS-30..50, Q-64; one task per session (Q-74). |
| Blocking in every browser and app | Built | Tabs closed (Apple Events on macOS, address bar + Ctrl+W on Windows), distraction apps quit, background tabs and apps re-checked every 15 s. Games and school pages recognized by looking, not lists (Q-74). |
| Side work for other tasks counts in the report | Built | Q-72. |
| Ending rules | Built | Dev build ends any time; others Stop past the goal, Step away, or the once-a-day Emergency stop with a retyped passage (Q-69, Q-70). |
| No quitting a locked session; force quit relaunches; gaps logged | Built | INV-15 changed by the owner (Q-70). |
| Report: Today, Activity (apps, sites, windows; day in blocks), Week, Sessions | Built | Q-65, Q-69, Q-74. |
| Proctoring (LockDown Browser) suspends blocking | Built | DSK-10. |
| Windows | Built | `native/helper-win.ps1` (PowerShell 5.1 + C#), compiled and smoke-tested in CI. No music volume or reopening quit apps on Windows (Q-71). |
| Automatic updates | Windows only | From the public `ajeetb123/tabhush-releases` repo, never mid-session (Q-75). macOS needs a signed app first. |
| Installers | Built | macOS DMGs (ad-hoc signed, not notarized: right-click → Open the first time); Windows NSIS installer from CI (SmartScreen warns until signed). |
| Telemetry, licensing, Safari/extension link | Not built | Q-26, DSK-02, DSK-03/12. |

## Owner to-do before a public launch

- Trademark search for "Tabhush", then buy `tabhush.com` (Q-01, Q-26).
- Apple Developer Program ($99/yr): notarized Mac builds, Mac auto-updates, and permissions that survive updates (DSK-11).
- Optional: a Windows code-signing certificate so SmartScreen stops warning.
- Fill the [OWNER] parts of `docs/business/privacy-policy-draft.md` and host it on the site.
- Review the app lists in `CONSTANTS.md` "Desktop app" (Q-70, Q-71) and whether chat apps stay blocked.
- A real test week to measure wrong blocks (Gate A).
- Decide whether usage counts are on by default; set the backend address (Q-26) or leave them off.

## Not verified

- Never run on a real Windows desktop yet (CI has no user session); the first tester run is the real check.
- A real update install (0.1.1 → a later version) hasn't happened yet.
- Game recognition (install folders, engine files) and school-page recognition are tested with fixtures, not on real installs.
- The regression set (QA-02), red team (QA-20), redaction set (QA-21) and performance budgets (QA-50, DSK-40's 200 MB; Electron is above it) need real data.

## Backend (beta 1 subset, not used by the app yet)

Install tokens with PoW (Q-06), tier 3 proxy with fixed prompts and strict schema, Free daily cap per UTC day (Q-58), telemetry intake, delete-my-data. Not built: IP rate limits, waves and the global dollar limit (Q-07), remote config (beta 2), licenses (v1), contributions. Never deployed; tier 3 is off (Q-61).

## Verified external APIs

- 2026-11-02: Electron 44.9.3; electron-builder 26.17.0 (ad-hoc `identity: "-"`, NSIS on Windows runners); electron-updater 6.8.10 (GitHub provider, feed set in code); macOS `NSWorkspace`, `AXUIElement` titles (Accessibility), `NSAppleScript` for Chrome-family and Safari tabs; Windows PowerShell 5.1 `Add-Type` (C# 5), UI Automation `ValuePattern` on the address bar.
- 2026-10-31: `@huggingface/transformers@4.3.2` local-only model loading (jsdelivr default overridden and stripped); `Xenova/all-MiniLM-L6-v2` `onnx/model_int8.onnx`, 22,972,370 bytes, Apache-2.0, revision pinned; SCOWL v1 2020.12.07 (notice required; SSA `names.zip` refuses automated download); `openai@7.47.0` (`gpt-5.4-nano`, Q-60, for if tier 3 is ever turned on).

## Built ahead of phase

- `POST /v1/delete` (BE-08, listed for v1): erasure exists from the start. No UI yet.
- The ask budget (CLS-25) is in core because LOOP-05 says so; asking is off by owner decision (Q-63).
