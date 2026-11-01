# 09 Log, UI and time definitions

Owner of: Today screen, session card, Week and Sessions, popup, visual style, time accounting definitions.
Numbers: `CONSTANTS.md` (ACTIVE_TIME).

## Design rule
**One big number, one clear breakdown, one insight.** No chart appears without a written takeaway next to it. Anything on screen reads in **3 seconds**.

## UI-01 Where it lives
- v1: extension **popup** (current session) and a **full-page view** (log).
- v1.5 Mac: menu-bar pill. v2 Windows: tray pill.

## UI-02 Today screen [beta2, Free]
Reference mockup (sample data):

```
┌──────────────────────────────────────────────────────────────────┐
│ Today   Week   Sessions                    ( ● Lab report · 42:18 )│
├──────────────────────────────────────────────────────────────────┤
│ 4h 12m               86%                        14                │
│ focused today        of session time on task    items parked      │
│                                                                    │
│ [░░██████░░▓▓▓▓▓░░███░░░▒▒▒▒░░▓▓▓░░░░░]   strip colored by task    │
│ 9am                      3pm                      9pm              │
│                                                                    │
│ BY TASK                                                            │
│ ● Lab report         2h 05m   3 sessions                           │
│ ● Internship work    1h 30m   2 sessions                           │
│ ● Calc homework        37m    1 session                            │
│ ○ Outside the browser (v1, until desktop app)                      │
│                                                                    │
│ Insight: You reached for YouTube 7 times, mostly after 3pm.        │
│          Your longest block was mid-morning.                       │
└──────────────────────────────────────────────────────────────────┘
```
- Headline: focused time today.
- Day strip colored by task (time range of the strip: [OPEN Q-46]).
- A row per task with hours and session count.
- An "outside the browser" bucket until the desktop app exists.
- One insight sentence. Generation rules: [OPEN Q-21].

## UI-03 Session card [beta2, Free]
Shown at End. Contains: task, duration, focus %, items parked, the **restore list**, the **"Where I left off"** note, task switches shown as **splits**, any **suspensions** (named-site lifts, overrides). **Exports as a clean image.**

## UI-04 Week and Sessions [v1, Pro]
- Week: hours per task per day, plus one insight sentence about when the user focuses best.
- Sessions: history of past sessions (session cards).

## UI-05 Popup [DERIVED from features]
Current task and timer, Switch task, Break, End, AI checks left today, Limited mode state, link to full log.

## UI-06 Style
One color per task · lots of whitespace · system font · dark mode · **no badges or confetti** (badges, pets and leaderboards are Out).
**Owner change 2026-11-01 (Q-66):** a calm, non-vibrant look: warm neutral background, one muted pine-green accent, ink buttons, muted task colors, no gradients or emoji. Font: **Plus Jakarta Sans** (OFL-1.1), bundled with the extension (no web fonts), system fonts as fallback.

## UI-07 Limited mode indicator
Toolbar badge shows "Limited mode" while failing open (`04` LOCK-08).

## UI-08 Visible AI cap
- The popup shows how many AI checks are left today.
- When the cap is hit, a banner says so and on-device tiers keep working.

## Time definitions (normative)

### TIME-01 Focus %
`time on task ÷ session time`. In v1 the outside-the-browser bucket is **excluded from both** numbers (two hours in an IDE must not show as 30% focus).

### TIME-02 Active time
Focused time only counts while the user is there. After **3 minutes with no input** on a normal page, time stops counting until input returns. Idle source: browser idle API (v1), system idle timer (desktop). Neither needs a permission.

### TIME-03 Video and PDF
- Video playing in an allowed **front** tab counts for up to **20 minutes** after last input, then a one-tap **"Still here?"** keeps it counting.
- PDF in front counts for up to **5 minutes** after last input.
- Neither ever counts as evidence for a training label.

### TIME-04 Day boundary
A day runs **4am to 4am** local time, so a session past midnight stays on one Today screen.

### TIME-05 One source per minute (v1.1+)
Only one source counts each minute: whichever had the most recent input (VS Code vs a browser tab on a second monitor are never double counted).

### TIME-06 Breaks and idle
Breaks show in the log but are not focused time [DERIVED]. Idle pauses don't count toward session time or max length.

## Acceptance criteria
- [ ] 2 h in VS Code (v1, no companion) + 1 h on-task in browser in a 3 h session shows focus % based on browser time only.
- [ ] A session from 11pm to 1am appears on one Today screen.
- [ ] 25 min video with no input: counts 20 min, then prompts "Still here?".
- [ ] Every chart has a takeaway sentence.
- [ ] Session card image export renders without URLs or titles of other tasks beyond the restore list.
