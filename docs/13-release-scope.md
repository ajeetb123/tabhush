# 13 Release scope and timeline

Owner of: what ships in each phase, the timeline, Later, Out. **Agents build only the current phase.** If a phase runs behind, its launch slips; **scope doesn't grow**.

## Time budget
About 2 h/day in semester, about 4 h/day over breaks: ~75 h November, ~20 h early December, ~110 h winter break, ~14 h/week spring. ~260 h by extension launch.
Estimates: setup ~10 h · labeling ~25 h before Gate A + ~6 h after beta 1 · beta 1 core ~60 · beta 2 additions ~65 · v1 additions ~25 · content ~25 through launch · VS Code companion ~15 to 20 · after launch ~3 h/week support · Mac app ~120+ · Windows ~60+.

## Timeline
```
Nov 1-7       SETUP: name + trademark search, domain, landing page, waitlist (own privacy notice + unsubscribe),
              ZDR request, Windows LAF token request, Safari test (2 h), measure LLM tokens/latency
Nov 8-29      EXTENSION CORE (incl. Thanksgiving): Start, task registry, sweep, overlay, rules + on-device model + LLM.
              Prototype clips start (Road to SWE build-in-public).
mid-Dec       GATE A  (see 14)   →  BETA 1: light friends alpha, through winter break
mid-Dec       GATE 0  (200+ waitlist signups from strangers)
Winter break  EXTENSION v1 FEATURES + MAC CORE STARTS: personal memory, Today screen, onboarding,
              Web Store (unlisted) submission, MoR application
Spring 1-3    BETA 2: 60-90 testers from the waitlist, Chrome/Edge/Brave · Mac app build (macOS layer, Pro licensing)
              GATE B (extension)
Spring 4      v1 LAUNCH: free extension + Pro + founding plan
right after   v1.1: VS Code companion
Spring 6-9    MAC APP BETA: founding members and volunteers · GATE B (Mac) + GATE P
Spring 10     v1.5 MAC APP LAUNCH (target). Public date for refunds: end of week 12.
Summer 2027   v2 WINDOWS APP, only if GATE C passes
```

## Beta 1: private extension, light friends alpha [from Gate A, mid-Dec, through winter break]
- Start from the toolbar; task inference from open tabs with the task registry and prototypes.
- Sweep with Confirm for the first 5 sessions and a 30-second undo.
- Overlay with mute and pause; blocking for distraction domains; show-then-judge for everything else.
- Tier 1, zero-label similarity, and tier 3 through the backend, with the verdict cache. **Changed by owner 2026-10-31 (Q-61): no tier 3. The on-device-only parking path (CLS-21) moves up from beta 2 so pages can be parked without an LLM.**
- The full never-locked list, including courseware, meetings and developer pages.
- Consent before the first tier 3 call (not shown while Q-61 keeps tier 3 off: nothing is sent), a privacy policy, basic telemetry, and the sampled "Was this park right?" check.
- Exit ladder steps 1 and 3 (override, End) [DERIVED: required to run any session safely].
- Opt-in redacted review export and refused-override logging [placement OPEN Q-29; roadmap puts review export in beta 1].

## Beta 2: private extension [spring weeks 1-3, 60-90 testers]
- Personal memory; on-device-only mode with its own parking path (the parking path moved to beta 1, Q-61).
- Switch task, timed breaks, emergency pass, the ask budget, Limited mode, the signed remote config.
- Session max length, idle pause and end, restart recovery, deferred updates.
- Overlay escape handling, the background audio setting, the visible AI cap.
- Today screen and session card, with "Where I left off", the outside-the-browser bucket and the restore list.
- Onboarding (including school domains), the incognito prompt, gap detection.
- Crash reporting with scrubbing; accessibility for the overlay and countdowns.
- The Web Store listing, approved after its winter-break submission.
- Thresholds tuned on beta 1's exported review records.

## v1: free extension launch [around spring week 4]
- Everything in beta 2, on Chrome, Edge and Brave for macOS and Windows. No Safari.
- Pro in the extension: higher AI caps, schedules, Week and Sessions history, custom break lengths.
- Founding plan with its refund terms; license keys with 5 activations; lost-key recovery.
- Export and import; delete-my-data; the "email me the link" page with platform detection.

## v1.1: VS Code companion [right after launch]
- VS Code extension (also Open VSX) reporting active editing and workspace name.
- Workspace mapped to a task the first time it appears; one source counted per minute.
- Local connection to the browser extension, paired with a one-time code.

## v1.5: macOS app, sold as Pro [beta spring 6-9, launch target week 10]
- Shared core + macOS layer: app parking with zero permissions, unpaired browser windows, lost-connection bypass detection.
- Same WASM classifier in the webview, with parity tests.
- Strict mode (the honest version); the opt-in "Lock in?" suggestion.
- Optional Accessibility for editor window titles.
- Direct download, notarized, auto-update.
- Free mode with the classifier helper and the bundled Safari extension; Pro unlocked by license key; its own beta and Gate B.

## v2: Windows app [summer 2027, only if Gate C passes]
- Windows layer on the same core, own beta and Gate B.
- Windows focus sessions if Microsoft grants the token; signed installer.

## Later (do NOT build)
- A shared base model from opt-in label contributions.
- Accounts with label sync (personal memory survives a new laptop).
- Task workspaces · earned breaks · a git commit signal · hiding YouTube's recommendation sidebar.
- "Lock in with friends" rooms · a friend-held code for strict mode.
- Canvas-aware sessions (depends on whether schools allow personal API tokens).
- Firefox extension and Linux.
- Chrome built-in model tier (test in v1.5 only if ≥ 30% availability).
- Privacy Pass style contribution tokens.

## Out (never build)
- Screenshots · page content leaving the device · keystroke content.
- Employer or team monitoring.
- Enforcement during proctored exams.
- Phone blocking.
- Tracking outside sessions (exception: the opt-in on-device front-app check behind "Lock in?").
- The Canvas submission signal (cut as fragile and low-value).
- Pets, badges and leaderboards.

## Content plan (non-code)
The build is the content: a recurring build-in-public series on Road to SWE from November, waitlist link in bio. One account; the app keeps its own name. Launch tied to the calendar, not follower count.
