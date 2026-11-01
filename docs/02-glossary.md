# 02 Glossary

Every term below has exactly this meaning in code, UI copy, telemetry and docs. If you need a term that is not here, add it here first.

## Sessions and tasks

- **Session**: one locked-in period, from Start to End. Has exactly one active task at a time; a task switch splits the session log.
- **Task**: what the user is working on, e.g. "Lab report". Has a stable **task ID** in the local **task registry**. Logs and personal memory key on the ID, never the name.
- **Task registry**: local store of all tasks with stable IDs, labels and prototypes. Inference picks from recent tasks first.
- **Task chip**: the UI element showing the inferred task at Start. The user can rename it before the sweep. Renames are the inference accuracy signal.
- **Profile**: one of Homework, Internship, Projects, Writing. Inferred from the task, never picked by the user. Selects a tool list in tier 1.
- **Prototype**: an embedding of an on-task item stored with a task (up to 50 per task). A task is represented by its label plus its prototypes.
- **Start snapshot**: the open tabs (titles + URLs, window and tab-group structure) at the moment Start is pressed; from v1.5 also front app name and window title.

## Items and verdicts

- **Item**: anything judged against the task: a tab/page in v1; from v1.5 also a desktop app or an unpaired browser window.
- **Item key**: the cache identity of an item: domain, path pattern, or origin + path (`05-classifier.md` CLS-40).
- **Verdict**: related, unrelated, or unsure.
- **Allow**: item is usable and its time counts toward the task.
- **Allow and flag**: allowed because no tier was sure; recorded so it can be reviewed. Never becomes a prototype.
- **Park**: lock an item for the rest of the session. For a tab: muted, media paused, covered by a lock overlay (page state kept). For a visit to a pure-distraction domain: blocked. From v1.5 for an app: hidden (Mac), minimized (Windows), or quit (known-safe apps only).
- **Parked item**: an item currently parked.
- **Restore list**: list shown at End of everything blocked or closed (and from v1.5, quit) so the user can reopen it.
- **Pure-distraction domain**: a domain blocked whole (e.g. Netflix, Steam, TikTok). Never auto-lifted; needs an override.
- **Mixed site**: a site with both work and distraction content (e.g. YouTube). Judged per page or path; only that page or channel is locked.
- **Mirror domain**: a domain that wraps another (m.youtube.com, youtube-nocookie.com, Google Translate proxies). Treated as the site it wraps.
- **Named site**: a site whose name or alias appears in the task label ("YouTube lecture notes"). Lifts only a mixed site's domain-wide pre-block.
- **Pre-block**: blocking rules installed ahead of time for known distraction domains, so they are stopped before load.
- **Never-locked list**: items that are never locked (`04-locking-and-exits.md` LOCK-02). Learning platforms on it are never parked at all.
- **Essentials list**: user-defined never-locked items, set before a session.

## Flow

- **Sweep**: at Start (and after a switch), judging all open items against the task and parking the unrelated ones.
- **Sweep preview**: the grouped list of items the sweep proposes to park. Items the user un-checks here are **keeps** (strong related labels).
- **Confirm**: user approval of the sweep. Required for the first 5 sessions.
- **Sweep undo**: reverting a committed sweep within 30 seconds (strong label).
- **Clarify prompt**: "What's this session for?" with 3 guesses and a text box. Shown when signal is thin or inference confidence is low, and on every scheduled start.
- **Ask**: a one-line "Is this for the <task>?" about one unsure item. Answer is remembered.
- **Ask budget**: at most 4 asks per hour and 1 per 5 minutes. Over budget: allow and flag.
- **Switch task**: changing the session's task (30-second countdown, re-sweep, log split).
- **Break**: timed unlock of everything for 5, 10 or 15 minutes, then automatic re-lock. Never a bail.
- **End / ended early**: a user-initiated End (2-minute countdown + one-line reason) marks the session "ended early". Max-length timeout with no answer, and idle end, are **normal** ends.
- **Where I left off**: a note auto-filled on device at End from the last on-task items; shown next time that task starts.
- **Session card**: the summary shown at End.

## Exits and bypasses

- **Override** ("This is for my task"): one sentence of explanation judged by the LLM. Accepted: allowed for this session only. Refused: logged for review.
- **Emergency pass**: unlocks one specific item for 10 minutes after a 30-second wait; 2 per day; logged.
- **Strict mode** (v1.5, opt-in, Pro): no emergency passes; ending takes a 10-minute countdown.
- **Bail**: an emergency pass or an early end within 2 minutes of a park. Reviewed by sampling, never a label.
- **Gap / bypass**: a period when enforcement was off without a normal flow (extension disabled, desktop app quit, lost connection, overlay deleted). Always logged.
- **Heartbeat**: a periodic timestamp written to storage so gaps can be detected on return.

## Classifier

- **Tier 1**: on-device rules and lists.
- **Tier 2**: on-device embedding model (zero-label similarity, then personal memory).
- **Tier 3**: LLM fallback through the backend, for middle-confidence items only.
- **s (relatedness)**: max(similarity to task label, mean of top-3 similarities to the task's item prototypes).
- **Personal memory**: nearest-neighbor store of the user's own labels, per task ID (beta 2).
- **Strong label**: clarify answers, sweep keeps, sweep undos, accepted overrides after 3 active minutes. Weight 1.0, 90-day half-life.
- **Weak label**: uncontested parks and uncontested tier 3 verdicts. Weight 0.3, 14-day half-life.
- **Shared domain prior**: crowd-sourced domain category tags from many installs. Only nudges, never parks.
- **Category**: one of work tool, reference, entertainment, social, games, shopping, other (returned by tier 3, or from the shipped category list).

## Modes and infrastructure

- **Limited mode**: fail-open state (backend down, spend cap hit, or no tier confident). Badge shows "Limited mode".
- **On-device only mode**: no tier 3 calls at all. Chosen by the user, or forced by declined consent or age.
- **Remote config**: signed data (thresholds, never-locked list, global fail-open switch) fetched by the extension. Never code.
- **Install token**: token bound to an install, issued at first install after a proof-of-work puzzle. Carried on tier 3 requests.
- **Install ID**: telemetry identifier. Personal data under GDPR.
- **Contribution ID**: separate, unlinked ID used only for shared-prior contributions.
- **Outside the browser bucket**: time not attributable in v1, shown separately and excluded from focus %.
- **Active time**: time counted only while the user is actually there (input-based rules in `09-log-and-ui.md`).
- **Day**: 4am to 4am local time.
- **Focus %**: time on task divided by session time (outside-browser bucket excluded from both).

## Business

- **Free**: the extension's free tier.
- **Pro**: the paid tier (extension power features, then the Mac app, strict mode, Windows app).
- **Founding plan**: discounted first year of Pro that includes the Mac app when it ships.
- **MoR**: merchant of record (Paddle default, Lemon Squeezy fallback).
- **License key**: unlocks Pro; up to 5 activations, each a browser install or Mac app.
- **ZDR**: zero data retention at the LLM provider.
- **Gate**: a go/no-go checkpoint with numeric criteria (`14-metrics-and-gates.md`).
