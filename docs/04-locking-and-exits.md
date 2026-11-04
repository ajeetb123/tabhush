# 04 Locking, exits, bypass detection and fail-open

Owner of: what is locked, what is never locked, the exit ladder, what parking does per item type, bypass detection, notifications, fail-open.
Numbers: `CONSTANTS.md` (EXITS, STRICT_MODE).

## Principle

This is an **accountability tool, not an unbreakable lock**. The extension can be disabled in one click and the desktop app can be quit. The product guarantees:

1. Friction against drifting.
2. A fair way out in an emergency.
3. A visible record of every bypass.

Do not add anti-tamper tricks that try to prevent disabling or quitting. Detect and log instead.

## LOCK-01 Locked during a session [beta1]
- Settings, the allowed set, and every parked item.
- The task changes **only** through Switch task (`03` LOOP-06).

## LOCK-02 Never locked [beta1]

Nothing on this list may ever be parked, overlaid, muted or blocked. Tier 3 cannot override it (INV-03). It is shipped in the build and also delivered in the signed remote config.

```
System and safety
  OS settings · browser settings pages · the password manager · school sign-in pages · the app itself

Learning platforms and courseware  (NEVER parked at all; INV-01)
  Canvas · Blackboard · Moodle · Brightspace · Gradescope · WebAssign · Pearson MyLab
  McGraw Hill Connect · zyBooks · Top Hat · Piazza · Ed Discussion · Panopto · Kaltura
  + school-hosted instances (e.g. canvas.vt.edu):
      - onboarding asks for the user's school          [mapping source OPEN Q-10]
      - also recognized by page fingerprint             [fingerprint method OPEN Q-10]
  Reason: timed quizzes keep ticking under an overlay. A wrong park here is the worst error.

Video meetings on the web
  Google Meet · Zoom · Teams

Developer pages
  localhost · 127.0.0.1 · file:// pages · *.local · GitHub · package registries   [registry list OPEN Q-11]

User essentials list
  Set by the user before the session (locked during it).
```

Browser settings stay reachable, which is exactly why disabling the extension is possible. That is accepted.

[DERIVED] "System and safety" is implemented as every browser-internal scheme (`chrome:`, `edge:`, `brave:`, `about:`, `chrome-extension:`, `devtools:`): settings pages, the built-in password manager, other extensions' pages (password-manager extensions included) and the app itself. Content scripts cannot reach these pages anyway. School sign-in pages have no list yet [OPEN Q-56].

## LOCK-03 Proctored exams [beta1 extension; v1.5 desktop]
- The extension **suspends itself** when it sees a proctoring tool like **Honorlock**. Detection method: [OPEN Q-20].
- From v1.5 the desktop app does the same when **Respondus LockDown Browser** starts, and **offers to quit** (LockDown Browser may refuse to run next to monitoring software).
- Both are **tested for real** before their betas.
- Enforcement during proctored exams is **Out** of scope permanently.

## LOCK-04 Exit ladder, cheapest first

**Owner change 2026-11-01 (Q-63):** steps 1 (override) and 2 (emergency pass) are removed, and blocks cannot be undone. Step 3 (End) stays, with a **30-second** countdown. The text below is the scope's original ladder, kept for reference.

```
1. "This is for my task."    [beta1]
   One sentence of explanation, judged by the LLM (tier 3).
   Accepted → item allowed for THIS SESSION ONLY.
   Refused  → logged for review (never a label).
   Accepted override becomes a training label ONLY after 3 active minutes on that item
   (active minute = ≥10 input events: keys, clicks, scrolls). A playing video doesn't count.
   When tier 3 is unavailable (on-device only / cap hit / backend down; always while Q-61 keeps the
   LLM off): the override is ACCEPTED AND LOGGED (Q-38, owner 2026-10-31). The sentence is still
   required; the item is allowed for this session only; the session card shows it as "not checked";
   a redacted review record is kept. An LLM "unsure" verdict: still OPEN Q-38 (nothing unlocks).

2. Emergency pass             [beta2]
   Lifts the lock on ONE specific item for 10 minutes after a 30-second wait.
   2 per day. Shown in the log.

3. End session                [beta1]
   Always available. 2-minute countdown + a one-line reason. Session marked "ended early".

4. Strict mode                [v1.5, opt-in, Pro]
   No emergency passes. Ending takes a 10-minute countdown.
   It slows exits INSIDE the app; disabling or quitting stays possible and gets logged.
```

All durations and counts are starting points to tune in the betas.

## LOCK-05 What parking does, by item

### Tabs [beta1; Chrome, Edge, Brave on both OSes; Safari from v1.5]
- Muted, media paused, covered by a lock overlay. Page state is kept underneath (INV-17).
- **"Background audio OK"** setting [beta2]: music keeps playing in a background tab while its page stays locked.
- Pages a content script can't reach (the **Chrome Web Store**, the **built-in PDF viewer**) are **closed and added to the restore list** instead.
- Pure-distraction domains: the visit is blocked (pre-block, `03` LOOP-09).

### Apps [v1.5 macOS, v2 Windows]
- **Mac:** a parked app is **hidden each time it comes to the front** (no permission needed). A small **"parked for this session"** notice explains why.
- **Windows:** minimized on the foreground-change event.
- Only **known-safe media and social apps** are ever **quit** [list OPEN Q-19]. An app showing a **save dialog** is hidden instead of quit.

### Unpaired browser windows [desktop app]
- Firefox, incognito without extension access, other profiles and guest windows are **treated like apps**.
- A window that can't be matched with certainty is **treated as paired** (fails open).

## LOCK-06 Bypass detection

- **Extension disabled or removed mid-session:** in v1 a **heartbeat** in storage means the gap shows up in the log when it is turned back on [interval OPEN Q-18]. From v1.5 the desktop app notices the lost connection right away and logs it as a bypass.
- **Overlay escapes:** a deleted overlay is **re-added and logged**. Media in a parked tab is **re-paused on every play event**, which also covers Picture-in-Picture and the browser's media controls.
- **Reader mode and embeds** of a parked site on other pages are judged **as that site**.
- **DevTools / mirror domains:** handled by re-adding overlays and normalizing domains; every escape logged. Detection is enough (accountability, not prevention).
- **Incognito:** onboarding asks for incognito access and shows its status. Without it, incognito is unprotected in v1.
- **Quitting the desktop app:** always possible, logged as a gap, **never followed by a relaunch** (INV-15). **Q-70:** during a locked session, Quit is refused and a force quit relaunches the app, except on the owner's development build and, since Q-83, an installed copy on the owner's own computer; shutdown and logout always work.

## LOCK-07 Notifications
- **v1 does not touch notifications.**
- **Mac (v1.5):** onboarding sets up a one-time **Focus Shortcut** that the app runs at Start and End.
- **Windows (v2):** focus sessions need a **Limited Access Feature token** for Microsoft's `FocusSessionManager` API. Request it now. If denied, chat apps are just minimized.
- The user's phone is never touched.

## LOCK-08 Fail open, visibly, fixable fast [beta2]
- Triggers: backend down, a spend cap hit, or no tier confident.
- Behavior: **nothing new gets locked**; unknown items are **allowed and flagged**; **nothing already parked unlocks**.
- The toolbar badge (later the menu-bar pill) shows **"Limited mode"**.
- Rules (tier 1) and the on-device model (tier 2) **keep running offline**.
- A **signed remote config** holds the thresholds, the never-locked list and a **global fail-open switch**. It is **data, not code** (Web Store compliant), so a bad threshold is fixed in minutes instead of waiting days for a store update. Details: `08` BE-03.
- When the daily AI cap is hit: a banner says so and on-device tiers keep working; users do not silently drop into Limited mode (`09` UI-08).

## Acceptance criteria

- [ ] No code path parks an item matching the learning-platform list or a school-hosted instance, including via tier 3 "unrelated", memory, or remote config thresholds. (Test with canvas.vt.edu.)
- [ ] Meet, Zoom and Teams web pages are never muted or overlaid.
- [ ] Accepted override allows the item for the session only; it is not cached past session end as related unless it becomes a strong label after 3 active minutes.
- [ ] Emergency pass: 30 s wait, 10 min unlock of one item, third pass in a day refused.
- [ ] End: 2 min countdown, reason required, session tagged ended early.
- [ ] Deleting the overlay node re-adds it and logs an escape. Playing parked media (including PiP) re-pauses it.
- [ ] Chrome Web Store and PDF viewer tabs judged unrelated are closed and appear in the restore list.
- [ ] Disabling then re-enabling the extension mid-session produces a logged gap.
- [ ] With backend unreachable: badge shows Limited mode, new unknown items allowed and flagged, existing parks remain.
