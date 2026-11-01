# 03 Core loop and session lifecycle

Owner of: Start, task inference flow, clarify, sweep, per-item judging flow, switch, end, breaks, show-then-judge, lifecycle.
Classifier internals: `05-classifier.md`. Exits: `04-locking-and-exits.md`. Numbers: `CONSTANTS.md`.

## Loop at a glance

```
Start ─► Infer task ─► (unsure?) Clarify ─► Sweep preview ─► Confirm / auto-commit (+30s undo)
                                                                   │
                         ┌─────────────────────────────────────────┘
                         ▼
                   ACTIVE SESSION: judge every new tab (v1.5: every app)
                     ├─ related   → allow, time counts
                     ├─ unrelated → park
                     └─ unsure    → ask once (within ask budget), remember answer
                   Switch task / Break / Exit ladder available
                         │
                         ▼
                   End ─► overlays lift, session card, restore list, "Where I left off"
```

## Session state machine [DERIVED]

States and transitions implied by the scope. Implement exactly these; add none without updating this doc.

```
IDLE
  └─ Start ───────────────────────► INFERRING
INFERRING
  ├─ confident (CLS-50) ──────────► SWEEP_PREVIEW
  └─ not confident / thin signal ─► CLARIFY
CLARIFY
  └─ user picks guess or types ───► SWEEP_PREVIEW
SWEEP_PREVIEW
  ├─ Confirm (always, first 5 sessions) ─► ACTIVE   (30s undo window opens)
  └─ auto-commit (session 6+, high confidence only) ─► ACTIVE (30s undo window opens)
ACTIVE
  ├─ Break ────────────────────────► ON_BREAK ── timer ends ──► ACTIVE (auto re-lock)
  ├─ Switch task ──────────────────► SWITCH_COUNTDOWN (30s) ──► SWEEP_PREVIEW (new task)
  ├─ 30 min no input ──────────────► IDLE_PAUSED
  ├─ session time reaches 4h ──────► EXTEND_PROMPT
  ├─ End ──────────────────────────► END_COUNTDOWN (2 min + reason) ──► ENDED(early)
  └─ proctoring tool detected ─────► SUSPENDED (see LOCK-03)
IDLE_PAUSED      (locks stay on, time stops counting)
  ├─ input ────────────────────────► ACTIVE
  └─ 2h idle ──────────────────────► ENDED(normal)
EXTEND_PROMPT
  ├─ extend ───────────────────────► ACTIVE   (increment: OPEN Q-32)
  └─ no answer ────────────────────► ENDED(normal)
ENDED → IDLE  (session card shown)
```

Undecided: whether the idle timers run during ON_BREAK [OPEN Q-39]; what SUSPENDED resumes to [OPEN Q-20].

## Requirements

### LOOP-01 Start [beta1]
- Triggers: toolbar button; the extension keyboard shortcut.
- Pro schedules can start sessions [v1, Pro]. A scheduled start **always** shows the clarify prompt. Schedule feature details: [OPEN Q-22].
- From v1.5: Mac menu-bar button; Windows tray in v2.

### LOOP-02 Infer the task [beta1]
- v1 reads all open tabs' titles and URLs (the start snapshot). v1.5 adds app names and window titles.
- Separate windows and tab groups are evidence. A window or group that does not match the task is treated as **deliberately separate** and asked about **as a whole**, not swept item by item.
- Inference matches the **task registry first**, so "Lab report" stays one task. A new name close to an existing one triggers "Same as Lab report?" (rules: `05` CLS-31).
- The user can rename the chip before the sweep. Every rename is recorded as the inference accuracy metric (`14`).
- Scoring and thresholds: `05` CLS-50.

### LOOP-03 Clarify only if unsure [beta1]
- Shown when the signal is thin (e.g. a blank tab, Gmail) or inference is below the autofill rule.
- Text: "What's this session for?" Offers **3 guesses** from open tabs plus a **text box**.
- The answer is a strong label.

### LOOP-04 Sweep [beta1]
- Unrelated items appear in a **preview grouped by domain**, capped to the largest groups so 80+ tabs stay readable. Cap value: [OPEN Q-17].
- **Recent and visible tabs are judged first.** Budget: 30 most recent tabs judged within 2 s of Start even with 80+ open.
- **First 5 sessions:** nothing is parked until the user taps **Confirm**.
- After that the sweep commits on its own **only when confidence is high** [OPEN Q-16]; otherwise it waits for Confirm [DERIVED].
- **Every sweep has a 30-second undo.** Undo restores all items parked by that sweep.
- Items the user un-checks in the preview are **keeps** (strong related labels). A sweep undo is a strong label.

### LOOP-05 Judge every new item [beta1; apps v1.5]
- **Related:** allowed; its time counts toward the task.
- **Unrelated:** parked.
  - Pure-distraction domains (Netflix, Steam) are blocked whole.
  - On mixed sites only that page or channel is locked (a lecture on YouTube works while Shorts stay locked).
- **Unsure:** asks once, "Is this for the <task label>?" The answer is remembered (cache + strong label). Ask budget applies (`05` CLS-25).
- Sites that change pages without reloading (YouTube and similar SPAs) are **re-judged on every in-page navigation**.

### LOOP-06 Switch task [beta2]
- A **Switch task** button in the toolbar popup (menu-bar/tray from v1.5).
- **Suggested switch:** "Switch to <other task>?" when the user opens a tool from another recent task (rule: `05` CLS-52). That tool **waits under the overlay** until the user answers.
- A switch costs a **30-second countdown**, **re-runs the sweep** against the new task, and **splits the log**.
- A switch must name another **work** task. "break" or anything that reads as leisure **opens the Break timer** instead (rule: `05` CLS-53).

### LOOP-07 End [beta1 basic; full card beta2]
- Overlays lift.
- The user gets the **session card** (`09`) and the **restore list** of anything blocked or closed (and from v1.5, quit).
- The **"Where I left off"** note is auto-filled **on device** from the last on-task items. Editable or skippable. Shown the next time that task starts. Generation details: [OPEN Q-44].
- A user-initiated End uses the exit ladder step 3 (`04` LOCK-04): 2-minute countdown + one-line reason, marked "ended early".

### LOOP-08 Breaks [beta2]
- A **Break** button unlocks everything for **5, 10 or 15 minutes**, then **re-locks on its own**.
- Capped at roughly **1 break minute per 5 focused minutes** [START]. Accrual details: [OPEN Q-34].
- Breaks show in the log and are **never bails**, so they don't pollute the wrong-park estimate.
- Pro: custom break lengths [v1].

### LOOP-09 Speed: show, then judge [beta1]
- **Known distraction domains** have blocking rules set ahead of time and are **stopped before they load**.
- A task that **names a mixed site** ("YouTube lecture notes") lifts **only its domain-wide pre-block**; its pages are still judged one by one.
- **Pure-distraction domains** (Netflix, TikTok) **never lift automatically**; they need a "this is for my task" override.
- **Every suspension shows on the session card.**
- **Every other page is shown right away and judged a moment later.** An unrelated page gets overlaid just after it appears: a brief flash, **never a blank page**.
- Tier 1 and tier 2 settle most pages in a fraction of a second (budget < 100 ms). The LLM only sees middle-confidence items.

### LOOP-10 Verdict cache [beta1]
- Verdicts are cached on **task ID + item key**, because a page allowed for one task isn't allowed for every task. Key rules and TTLs: `05` CLS-40.
- Mirror domains are normalized to the site they wrap before keying.

### LOOP-11 Session lifecycle [beta2]
- **Max length:** 4 hours of session time, counting work and breaks but **not idle pauses**. Then a one-tap prompt to extend. **No answer ends the session normally**, not as "ended early".
- **Idle:** after 30 minutes without input the session **pauses**. Locks stay on and time stops counting. After **2 hours idle**, it **ends** (normal), so a forgotten session never keeps Netflix locked until tomorrow.
- **Restart, sleep and crash:** the session lives in persistent storage and **resumes if still within max length**. Restored tabs are **re-judged before they show**.
- **Extension updates:** an update arriving mid-session **waits until the session ends** (INV-14), so content scripts and overlays don't silently disconnect.
- All numbers are starting points to tune in the betas.

## Acceptance criteria

- [ ] Start from toolbar and shortcut both produce a task chip or the clarify prompt within budget.
- [ ] A non-matching window/tab group is asked about as one unit, not swept.
- [ ] Sessions 1 to 5: zero items parked before Confirm. Session 6+: auto-commit only above the confidence rule; undo works for 30 s and restores every item.
- [ ] Preview stays readable with 80+ tabs (grouped, capped).
- [ ] SPA navigation to a new video/path triggers a fresh judgment.
- [ ] Switch to "break" or "watch Netflix" opens the Break timer; "watch Rashomon for film class" is accepted as a work task.
- [ ] After a break ends, all previously parked items are parked again without user action.
- [ ] Session resumes after browser restart within max length; restored tabs are judged before being visible.
- [ ] 30 min no input pauses; 2 h idle ends normally; max-length no-answer ends normally.
- [ ] An extension update during a session is not applied until End.
- [ ] Never a blank page: unrelated pages render first, then get overlaid.
