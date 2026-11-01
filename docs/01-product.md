# 01 Product overview

Owner of: what the product is, who it is for, positioning, the six pillars, competitive context.
Numbers: `CONSTANTS.md`. Terms: `02-glossary.md`.

## What it is

A browser extension first, then a desktop app for macOS and Windows. The user presses **Start** on whatever they are working on. The product **infers the task**, **locks everything unrelated** for the session, and **logs focused time per task**.

One-liner: *Hit Start from wherever you are. It figures out the task, locks everything unrelated, and counts the work.*

## Positioning

- An **accountability tool** that enforces **by task** with **zero per-session setup**.
- It raises the cost of drifting and **makes every bypass visible**.
- It is **not** an unbreakable lock like Cold Turkey and must never claim to be.

Marketing and UI copy rules (apply to any string an agent writes):

- PROD-01 Never claim a lock as strong as Cold Turkey's.
- PROD-02 Never claim a moat that does not exist yet. Keep the word "only" out of marketing.
- PROD-03 Disclose "I built this" in bio and captions. Show only numbers the app actually recorded, bad days included.
- PROD-04 Recheck competitor features and prices before publishing any comparison.
- PROD-05 Until the desktop app ships, the honest pitch is the browser experience, not cross-app enforcement.

## Who it is for

- Students and early-career developers who want to lock in.
- Starting with CS students reached through the owner's **Road to SWE** content.
- The working half of the audience is likelier to pay, so marketing speaks to both.
- The owner is user #1.

## Goal

A business that makes money. A paid tier exists from launch, not after (`10-business-and-licensing.md`).

## What it measures

Focused hours **per task**. In v1 that means **browser time**, with time outside the browser shown as its own bucket. The VS Code companion (v1.1) adds coding time. The desktop app makes it complete.

## Platform phases

```
v1    Free extension: Chrome, Edge, Brave on macOS and Windows + small backend. Pro sold in-extension from day one.
v1.1  VS Code companion (also Open VSX for Cursor and Windsurf).
v1.5  macOS desktop app, sold as Pro, with a real free mode (classifier helper + bundled Safari extension).
v2    Windows desktop app, summer 2027, only if Gate C passes.
```

Safari ships **inside** the Mac app (v1.5) because a Safari extension can only talk to its own containing app. Safari cannot launch before the Mac app.

## The six pillars

v1 delivers pillars 1, 3, 5, 6 in the browser. Pillar 2 needs the desktop app. Pillar 4 grows with use.

```
1. Zero per-session setup                         [v1]
   Setup happens once (extension + optional essentials list; later the desktop app).
   After that the user never types a task, picks a profile, or edits a list.
   Start infers the task from open tabs (and from v1.5 the front window), asking one line only when unsure.

2. Enforces across apps and browsers              [v1.5 Mac, v2 Windows]
   One session covers desktop apps and every browser window. Until then desktop apps are untouched.

3. Locks without losing work                      [v1 tabs, v1.5 apps]
   Unrelated tabs are muted, paused, and covered by a lock overlay, never closed, so forms,
   drafts and quizzes keep their state. Apps are hidden (Mac) or minimized (Windows) each time they
   come to the front; only a short list of known-safe apps is ever quit.

4. Learns what "on task" means for each user      [beta1 zero-label, beta2 personal memory]
   On-device embedding model compares each page with the task from the first session, no labels.
   A personal memory of the user's own answers sharpens it. Lost on reinstall until accounts exist.

5. Time per task, not per app                     [v1 browser time]
   "2h 40m on the lab report, 1h 15m on internship work", because every item was judged against
   the session's task. Time outside the browser is its own bucket until the desktop app attributes it.

6. Private by design                              [v1]
   No screenshots, page content, or keystrokes leave the machine. For items on-device tiers can't
   decide: a redacted title, the domain, and any override sentence go to an LLM. Webmail, web chat,
   banking and health send the domain only. See 06-privacy-data-contract.md.
```

## Competitive context (reference only, not for code)

Four quadrants by "closes things vs nudges" and "fixed list vs AI reads task":

- **Hard blockers (list-based, close things):** Freedom ($39.99/yr or $8.99/mo, cross-platform, locked sessions can't end early), Cold Turkey (Win/Mac, free or $39 one-time, strictest), FocusMe (Win/Mac/Linux/Android, ships AI coaching, likeliest fast follower), Opal (phone-first, now Mac, Pro $99.99/yr), OS Screen Time / Windows Focus sessions (free, the real default to beat).
- **AI trackers (know time, don't enforce):** Rize (Mac/Win, $13/mo Standard, $24/mo Professional, list-based blocker).
- **AI coaches (know task, only nag):** Fomi (macOS, $8/mo, sends screenshots to cloud), Focarium (desktop + extension, tab title + domain to local classifier, nudges only; closest architecture minus enforcement).
- **AI task blockers (know task, close pages, browser only):** Focus AI (Chrome, type task each time, strict/nuclear modes), Gondolin (free, web only).

v1 sits in the same corner as the browser-only task blockers. Differentiation for v1: no typing the task, a lock that keeps page state, time per task, coverage of Chrome, Edge and Brave on Mac and Windows. From v1.5: desktop apps, with a model that learns each user. The window to own cross-app enforcement is probably about a year.

These facts were gathered for the scope and must be rechecked before any public use (PROD-04).
