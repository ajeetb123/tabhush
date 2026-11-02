# 11 Desktop app: v1.5 macOS, v2 Windows

> **Owner change 2026-11-02 (Q-70):** the macOS app is the product now, replacing the extension, built with **Electron** (not Tauri) and a Swift helper for the macOS layer. Tracking of apps, window titles and browser pages for the report, Accessibility asked at setup, blocked apps quit, no quitting during a locked session (force quit relaunches), and a retype-the-passage emergency task. Where this file disagrees, Q-70 wins. Built: DSK-10 front app, idle, proctoring watch, excluded apps; DSK-30 menu-bar pill, launch at login. Not built yet: DSK-02 licensing, DSK-03/12 extension link and Safari, DSK-11 notarization and auto-update, the "Lock in?" suggestion.

Owner of: the Tauri desktop app, shared core, OS layers, distribution, free mode, desktop-specific enforcement.
Do not start v2 (Windows) unless Gate C has passed. Behavior shared with the extension lives in `03`, `04`, `05`.

## DSK-01 Stack
- **Tauri** app with a **Rust shared core**: session engine, cache, task registry, storage, backend client, UI.
- **Tier 2 = the same WASM classifier module** as the extension, run in Tauri's **webview**. Reused, **not rewritten in Rust**. **Parity tests** prove identical scores (`15` QA-12).
- Hidden webviews get throttled: the app **opts out of App Nap during sessions**, and classification speed is tested with the window closed.

## DSK-02 Free mode and Pro
- **Real free mode:** the classifier helper and the **bundled Safari extension** work without Pro, so free Safari users are covered.
- **Pro** (license key): app parking and the rest of the desktop features, strict mode.
- Exact split of desktop features between free mode and Pro beyond the above: [OPEN Q-54].

## DSK-03 Extension link
- Native messaging host registered separately for **Chrome, Edge and Brave**.
- The host accepts connections **only from the extension's own ID**.
- A **lost extension connection** during a session is logged as a **bypass** right away.
- One session covers desktop apps and every browser window.

## DSK-10 macOS layer [v1.5] (zero permissions by default)
- Front app from **NSWorkspace**.
- Parked apps are **hidden each time they come to the front**, with a small "parked for this session" notice.
- Only known-safe media/social apps are ever quit [list OPEN Q-19]; an app with a save dialog is hidden instead.
- **Focus Shortcut** (set up once in onboarding) runs at Start and End.
- Proctoring watch: when **Respondus LockDown Browser** starts, suspend and **offer to quit** the app.
- Idle time from the **system idle timer**.
- **Accessibility permission is optional**, only to read editor window titles.
- Unpaired browser windows (Firefox, incognito without access, other profiles, guest) treated like apps; uncertain match = paired (fail open).
- **App Attest** on macOS 27+ for install tokens.
- Minimum macOS **13 Ventura**.

## DSK-11 Mac distribution
- **Direct download, notarized, built-in updater** (signed auto-updates).
- **Not** the Mac App Store (would require Apple in-app purchase instead of license keys; sandbox may block hiding other apps).
- Apple Developer Program $99/yr from the Mac beta.

## DSK-12 Safari
The Safari extension ships **inside** the Mac app. Classification runs in the Safari extension or in the app's classifier helper depending on the Safari test (`07` EXT-13).

## DSK-20 Windows layer [v2, only if Gate C passes]
- Foreground window and titles via **Win32** (no permission prompt).
- Parked apps **minimized on the foreground-change event**.
- Focus sessions via **FocusSessionManager** if Microsoft grants the **Limited Access Feature token**; otherwise chat apps are minimized. Plan as if denied.
- **Signed installer**; code signing via Microsoft Artifact Signing from the **first beta build** (SmartScreen warns until download history builds; explain on the download page).

## DSK-30 Both OSes
- Launch at login.
- **Never relaunch after a quit** (INV-15); quitting is logged as a gap.
- Signed auto-updates; no downloaded code (INV-05).
- Opt-in **"Lock in?" suggestion**: an on-device front-app check outside sessions; data stays on device [details OPEN Q-33].
- Menu-bar pill (Mac) / tray pill (Windows) for status, Start, Switch.
- Excluded apps (Messages, Mail, Slack, Discord) never send titles.

## DSK-40 Performance [START]
Mac app: < 1% CPU idle; < 200 MB memory.

## Acceptance criteria
- [ ] Parked app re-hidden every time it is brought to front, with the notice; no permission prompt required.
- [ ] Quitting the app during a session: logged gap, no relaunch.
- [ ] Native messaging host rejects a different extension ID.
- [ ] Classifier parity set: identical scores to the extension.
- [ ] Classification latency within budget with the app window closed (App Nap disabled during sessions).
- [ ] Respondus LockDown Browser launch suspends enforcement and offers to quit.
