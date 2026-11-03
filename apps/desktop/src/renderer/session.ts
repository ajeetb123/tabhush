// The main page (Q-64, Q-69, Q-70). Idle: Start, and the one-time permissions. Start screen: the
// tasks named from what's open, a time goal and what gets blocked (LOOP-04), then "Lock in".
// Running: the goal ring, breaks, Step away and the exits. Ended: the full session report.

import { BRAND, BREAKS, breakMinutesAvailable, defaultGoal, EXITS, goalNote, goalReached, MS, OWNER_RULES, SESSION, typicalMinutes } from "@tabhush/core";
import type { PreviewItem, Session } from "../shared/types";
import { avatar, blockedCount, call, focusOrb, formatDuration, getSnapshot, goalRing, h, onStateChange, playEnter, setMood, setTitle, stat, topbar, type Mood, type Snapshot } from "./common";
import { exitActions, stopButton } from "./exits";
import { asSessionLike, focusSplit, offClockMs } from "./reportData";
import { endLabel, sessionDetail } from "./sessionDetail";

const main = document.querySelector("main")!;
const footer = document.createElement("div");
footer.className = "footer";
document.body.append(footer);

let goal: number | null = null; // chosen on this page; defaults to the user's typical session
let tick: number | undefined;

function setFooter(...children: (Node | string)[]): void {
  footer.hidden = children.length === 0;
  footer.replaceChildren(h("div", { className: "inner" }, ...children));
}

function hero(pill: Parameters<typeof topbar>[0], title: string, lead?: string): HTMLElement {
  return h("div", { className: "hero" }, topbar(pill), h("h1", { textContent: title }), lead ? h("p", { className: "lead", textContent: lead }) : null);
}

// ───────────────────────── idle ─────────────────────────

function permissionsCard(snap: Snapshot): HTMLElement | null {
  if (snap.permissions.accessibility) return null;
  const allow = h("button", { className: "btn primary", textContent: "Allow" });
  allow.addEventListener("click", () => void call({ type: "requestAccessibility" }).then(() => call({ type: "openPrivacyPane", pane: "accessibility" })));
  return h(
    "div",
    { className: "card stack" },
    h("b", { textContent: "One permission for a more useful report" }),
    h("p", { className: "muted small", textContent: `This lets your report say which doc or page you worked in, not just the app. It never leaves this computer.` }),
    h("div", { className: "row" }, allow),
  );
}

function idleView(snap: Snapshot): Node[] {
  setTitle("");
  const start = h("button", { className: "btn primary block", textContent: "Start" });
  start.addEventListener("click", () => {
    start.disabled = true;
    void call({ type: "start" }).finally(() => (start.disabled = false));
  });
  const now = snap.front ? `${snap.front.label}${snap.front.title ? ` · ${snap.front.title}` : ""}` : null;
  return [
    hero({ text: "Ready" }, "Time to lock in", "It reads what you have open, names the task, and quiets everything else."),
    focusOrb(),
    start,
    ...[permissionsCard(snap)].filter((n): n is HTMLElement => n !== null),
    snap.settings.trackAllDay ? h("p", { className: "muted small", textContent: "Your report shows where your time goes. It stays on this computer." }) : null,
  ].filter((n): n is HTMLElement => n !== null);
}

// ───────────────────────── start screen ─────────────────────────

/**
 * Q-78: up to MAX_TASKS_PER_SESSION tasks. Your tasks are filled chips (× removes); suggestions add
 * with a click, and their small × forgets a task you don't want suggested again (a typo, a test).
 */
function tasksCard(s: Session): HTMLElement {
  const labels = s.taskLabels ?? (s.taskLabel ? s.taskLabel.split(" + ") : []);
  const max = OWNER_RULES.MAX_TASKS_PER_SESSION;
  const setTasks = (next: string[]) => void call({ type: "setTasks", labels: next });
  const mine = labels.map((l) => {
    const chip = h("button", { className: "chip on", textContent: `${l}  ×`, attrs: { "aria-label": `Remove ${l}` } });
    chip.addEventListener("click", () => setTasks(labels.filter((x) => x !== l)));
    return chip;
  });
  const full = labels.length >= max;
  const suggested = s.suggestions
    .filter((g) => !labels.includes(g.label))
    .map((g) => {
      const add = h("button", { className: "chip-main", textContent: `+ ${g.label}`, disabled: full, attrs: { "aria-label": `Add ${g.label}` } });
      add.addEventListener("click", () => setTasks([...labels, g.label]));
      const forget = h("button", { className: "chip-x", textContent: "×", title: "Don’t suggest this again", attrs: { "aria-label": `Forget ${g.label}` } });
      forget.addEventListener("click", () => void call({ type: "forgetTask", taskId: g.taskId }));
      return h("span", { className: "chip split" }, add, forget);
    });
  const input = h("input", { type: "text", disabled: full, placeholder: full ? `Up to ${max} tasks` : labels.length ? "Add another task" : "What are you working on?", attrs: { "aria-label": "Add a task" } });
  input.addEventListener("keydown", (e) => e.key === "Enter" && input.value.trim() && setTasks([...labels, input.value.trim()]));
  input.style.flex = "1";
  return h(
    "div",
    { className: "card stack" },
    mine.length || suggested.length ? h("div", { className: "chips" }, ...mine, ...suggested) : null,
    h("div", { className: "row" }, input),
    h("p", { className: "muted small", textContent: `Doing more than one thing? Add up to ${max}. Your report splits the time between them.` }),
  );
}

function goalCard(typical: number | null): HTMLElement {
  goal ??= defaultGoal(typical);
  const presets = OWNER_RULES.GOAL_PRESETS_MIN.map((m) => {
    const b = h("button", { className: "chip", textContent: `${m} min`, attrs: { "aria-pressed": String(goal === m) } });
    b.addEventListener("click", () => {
      goal = m;
      void render();
    });
    return b;
  });
  const custom = h("input", {
    type: "number",
    min: String(OWNER_RULES.GOAL_MIN_MIN),
    max: String(SESSION.MAX_LENGTH_MIN),
    value: (OWNER_RULES.GOAL_PRESETS_MIN as readonly number[]).includes(goal) ? "" : String(goal),
    placeholder: "Custom",
    attrs: { "aria-label": "Custom minutes" },
  });
  custom.style.width = "110px";
  custom.className = "chip";
  custom.addEventListener("change", () => {
    const v = Number(custom.value);
    if (v > 0) {
      goal = Math.min(SESSION.MAX_LENGTH_MIN, Math.max(OWNER_RULES.GOAL_MIN_MIN, Math.round(v)));
      void render();
    }
  });
  const note = goalNote(goal, typical);
  return h(
    "div",
    { className: "card stack" },
    h("div", { className: "chips" }, ...presets, custom),
    typical !== null ? h("p", { className: "muted small", textContent: `Your usual: about ${typical} min.` }) : null,
    note ? h("p", { className: "note", textContent: note }) : null,
  );
}

function blockList(s: Session): Node[] {
  if (!s.preview.length) {
    return [h("div", { className: "card empty", textContent: s.taskIds.length ? "Nothing to block. Everything open fits." : "Add a task to see what gets blocked." })];
  }
  const groups = new Map<string, PreviewItem[]>();
  for (const i of s.preview) groups.set(i.label, [...(groups.get(i.label) ?? []), i]);
  return [...groups.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .map(([label, items]) => {
      const list = h("ul", { className: "items" });
      for (const item of items) {
        const box = h("input", { type: "checkbox", checked: item.park, attrs: { "aria-label": `Block ${item.title}` } });
        box.addEventListener("change", () => void call({ type: "toggle", id: item.id, park: box.checked }));
        list.append(h("li", {}, h("label", {}, box, h("span", { className: "title", textContent: item.kind === "app" ? "Quit the app" : item.title || item.url || "" }))));
      }
      const what = items[0]!.kind === "app" ? "app" : `${items.length} tab${items.length === 1 ? "" : "s"}`;
      return h("div", { className: "card" }, h("div", { className: "site" }, avatar(label), h("div", {}, h("div", { textContent: label }), h("div", { className: "muted small", textContent: what }))), list);
    });
}

function startView(s: Session, history: number[]): Node[] {
  setTitle("Lock in");
  const typical = typicalMinutes(history);
  const toBlock = s.preview.filter((p) => p.park).length;
  const lockIn = h("button", { className: "btn primary", textContent: `Lock in for ${goal ?? defaultGoal(typical)} min`, disabled: s.taskIds.length === 0 });
  lockIn.addEventListener("click", () => void call({ type: "confirm", goalMin: goal ?? defaultGoal(typical) }));
  const cancel = h("button", { className: "btn", textContent: "Not now" });
  cancel.addEventListener("click", () => void call({ type: "end", reason: "cancelled at start" }).then(() => call({ type: "dismiss" })));
  setFooter(h("div", { className: "row" }, cancel, h("span", { className: "muted small", textContent: "Blocks stay until you finish." })), lockIn);
  return [
    hero({ text: "Ready" }, "Let’s lock in", s.taskIds.length ? "Here’s what your open windows say you’re working on." : "Tell it what you’re working on."),
    h("h2", { textContent: "Working on" }),
    tasksCard(s),
    h("h2", { textContent: "For how long" }),
    goalCard(typical),
    ...s.suspensions.map((x) => h("p", { className: "muted small", textContent: x })),
    h("h2", { textContent: `Getting blocked · ${toBlock}` }),
    ...blockList(s),
  ];
}

// ───────────────────────── running ─────────────────────────

/** Breaks (LOOP-08): 5, 10 or 15 minutes, earned at 1 minute per 5 on task (Q-34). */
function breakCard(s: Session): HTMLElement {
  const used = s.breaks.reduce((sum, b) => sum + b.plannedMin, 0);
  const available = breakMinutesAvailable(focusSplit(asSessionLike(s), Date.now()).on, used);
  const buttons = BREAKS.OPTIONS_MIN.map((m) => {
    const b = h("button", { className: "chip", textContent: `${m} min`, disabled: available < m });
    b.addEventListener("click", () => void call({ type: "break", min: m }));
    return b;
  });
  const note = available >= BREAKS.OPTIONS_MIN[0] ? `${available} min of break earned` : `Earn 1 min per ${BREAKS.FOCUSED_MIN_PER_BREAK_MIN} focused`;
  return h("div", { className: "card stack" }, h("div", { className: "spread" }, h("b", { textContent: "Break" }), h("span", { className: "muted small", textContent: note })), h("div", { className: "chips" }, ...buttons));
}

/** Q-72: name a side task mid-session so its work counts as other productive work. */
function sideWorkCard(s: Session, snap: Snapshot): HTMLElement | null {
  if (!snap.settings.countOtherWork) return null;
  const input = h("input", { type: "text", placeholder: "Also working on something else? Name it", attrs: { "aria-label": "Other task" } });
  input.style.flex = "1";
  const add = h("button", { className: "btn", textContent: "Add" });
  const submit = () => input.value.trim() && void call({ type: "addOther", label: input.value.trim() });
  add.addEventListener("click", submit);
  input.addEventListener("keydown", (e) => e.key === "Enter" && submit());
  const named = snap.otherTasks ?? [];
  return h(
    "div",
    { className: "card stack" },
    h("b", { textContent: "Side work" }),
    h("p", { className: "muted small", textContent: "Work for your other tasks is spotted on its own and counts as productive. Name a new one here so it’s recognized." }),
    named.length ? h("div", { className: "chips" }, ...named.map((l) => h("span", { className: "chip static", textContent: l }))) : null,
    h("div", { className: "row" }, input, add),
  );
}

function runningView(s: Session, snap: Snapshot): Node[] {
  setTitle(s.taskLabel ?? "");
  setFooter();
  const ring = goalRing();
  const paused = s.state === "IDLE_PAUSED";
  const onBreak = s.state === "ON_BREAK";
  const ending = s.state === "END_COUNTDOWN" && s.endCountdown;
  const countdownSec = s.emergency ? OWNER_RULES.EMERGENCY_COUNTDOWN_SEC : EXITS.END_COUNTDOWN_SEC;
  const actions = h("div", { className: "card stack" });
  let shownReached: boolean | null = null;
  const front = h("p", { className: "muted small" });

  ring.setLive(s.state === "ACTIVE");

  // Q-78: a first-timer who started by mistake can back out for a couple of minutes.
  const until = snap.endAccess.mistakeCancelUntil;
  const mistakeLeft = h("span", { className: "muted small" });
  const cancel = h("button", { className: "btn", textContent: "Cancel session" });
  cancel.addEventListener("click", () => {
    cancel.disabled = true;
    void call({ type: "cancelMistake" });
  });
  const mistake =
    until && s.state !== "END_COUNTDOWN"
      ? h(
          "div",
          { className: "card stack mistake" },
          h("b", { textContent: "Started this by mistake?" }),
          h("p", { className: "muted small", textContent: "You can still cancel. Nothing is saved, and the tabs and apps it closed open again." }),
          h("div", { className: "spread" }, mistakeLeft, cancel),
        )
      : null;

  const update = () => {
    const now = Date.now();
    if (mistake && until) {
      const left = until - now;
      if (left <= 0) mistake.remove();
      else mistakeLeft.textContent = `${Math.floor(left / MS.MINUTE)}:${String(Math.floor((left % MS.MINUTE) / MS.SECOND)).padStart(2, "0")} left`;
    }
    if (ending) {
      const left = Math.max(0, s.endCountdown!.startedAt + countdownSec * MS.SECOND - now);
      ring.update(left, null, "until it ends", left / (countdownSec * MS.SECOND));
      return;
    }
    if (onBreak) {
      const b = s.breaks[s.breaks.length - 1]!;
      const left = Math.max(0, b.startedAt + b.plannedMin * MS.MINUTE - now);
      ring.update(left, null, "of break left", left / (b.plannedMin * MS.MINUTE));
      return;
    }
    const elapsed = now - (s.committedAt ?? s.startedAt) - offClockMs(s, now);
    const reached = goalReached(s.committedAt, s.goalMin, now, offClockMs(s, now));
    ring.update(elapsed, s.goalMin, paused ? "paused" : reached ? "goal reached" : s.goalMin ? `of ${s.goalMin} min` : "");
    if (reached !== shownReached && s.state === "ACTIVE") {
      shownReached = reached;
      actions.replaceChildren(exitActions(snap.endAccess, reached));
    }
  };

  if (paused) {
    const back = h("button", { className: "btn primary block", textContent: "I’m back" });
    back.addEventListener("click", () => void call({ type: "resume" }));
    const reached = goalReached(s.committedAt, s.goalMin, Date.now(), offClockMs(s, Date.now()));
    actions.replaceChildren(back, ...(reached ? [stopButton()] : []));
  } else if (onBreak) {
    const back = h("button", { className: "btn primary block", textContent: "Back to work" });
    back.addEventListener("click", () => void call({ type: "breakEnd" }));
    actions.replaceChildren(back);
  } else if (ending) {
    actions.replaceChildren(h("p", { className: "muted small", attrs: { role: "status" }, textContent: "Blocks stay on until the countdown finishes." }));
  }
  update();
  tick = window.setInterval(update, MS.SECOND);
  if (snap.front && s.state === "ACTIVE") front.textContent = `In front: ${snap.front.label}${snap.front.title ? ` · ${snap.front.title}` : ""}`;

  const pause = paused && s.pauses[s.pauses.length - 1]?.auto;
  const top = ending
    ? hero({ text: s.emergency ? "Emergency stop" : "Ending", tone: "warn" }, "Wrapping up", s.taskLabel ?? undefined)
    : onBreak
      ? hero({ text: "On a break" }, "Take a breather", "Everything’s unlocked for now. It locks again on its own.")
      : paused
        ? hero({ text: "Stepped away" }, pause ? "Paused while you were away" : "Go do your thing", "Your clock is stopped and blocks stay on. It ends on its own after 2 hours away.")
        : hero({ text: "Locked in", tone: "live" }, "You’re locked in", s.taskLabel ?? undefined);
  return [
    top,
    mistake,
    h("div", { className: "card ring-card" }, ring.el, s.state === "ACTIVE" ? h("p", { className: "breath-hint", textContent: "Breathe with the ring." }) : null),
    h("div", { className: "stats" }, stat(String(blockedCount(s)), "blocked so far"), stat(formatDuration(focusSplit(asSessionLike(s), Date.now()).on), "on task")),
    ...(s.state === "ACTIVE" ? [breakCard(s)] : []),
    actions,
    ...(s.state === "ACTIVE" ? [sideWorkCard(s, snap)] : []),
    front,
    s.suspendedFor ? h("p", { className: "note", textContent: `${s.suspendedFor} is running, so blocking is paused.` }) : null,
  ].filter((n): n is HTMLElement => n !== null);
}

// ───────────────────────── ended ─────────────────────────

function endedView(s: Session): Node[] {
  setTitle("Session summary");
  const again = h("button", { className: "btn primary", textContent: "Start a new session" });
  again.addEventListener("click", () => void call({ type: "start" }));
  const done = h("button", { className: "btn", textContent: "Done" });
  done.addEventListener("click", () => void call({ type: "dismiss" }));
  const forget = h("button", { className: "linkish", textContent: "This was a test. Don’t count it" });
  forget.addEventListener("click", () => {
    if (window.confirm("Take this session out of your report? Its tasks are forgotten too, unless another session uses them.")) void call({ type: "deleteSession", id: s.id });
  });
  const report = h("button", { className: "btn", textContent: "See your day" });
  report.addEventListener("click", () => void call({ type: "dismiss" }).then(() => location.replace("report.html")));
  setFooter(h("div", { className: "row" }, report, done), again);
  const duration = (s.endedAt ?? Date.now()) - (s.committedAt ?? s.startedAt);
  const won = s.endKind === "normal";
  const label = endLabel(asSessionLike(s));
  const out: Node[] = [
    hero({ text: label.charAt(0).toUpperCase() + label.slice(1) }, won ? "Session complete" : "Session over", s.taskLabel ?? undefined),
    h("div", { className: "stats" }, stat(formatDuration(duration), "locked in"), stat(s.goalMin ? `${s.goalMin} min` : "–", "goal")),
    sessionDetail(asSessionLike(s)),
    forget,
  ];
  if (s.gaps.length) {
    const total = s.gaps.reduce((a, g) => a + g.to - g.from, 0);
    out.push(h("p", { className: "muted small", textContent: `${BRAND.NAME} wasn’t running for ${Math.round(total / MS.MINUTE)} min of this session; that time didn’t count.` }));
  }
  if (s.restoreList.length) {
    out.push(h("h2", { textContent: "Reopen" }));
    const list = h("ul", { className: "items" });
    s.restoreList.forEach((r, index) => {
      const open = h("button", { className: "btn", textContent: "Reopen" });
      open.addEventListener("click", () => void call({ type: "reopen", index }));
      list.append(h("li", { className: "spread" }, h("span", { className: "title", textContent: r.title }), open));
    });
    out.push(h("div", { className: "card" }, list));
  }
  return out;
}

let lastView = "";

const moodFor = (s: Session | null): Mood => {
  if (!s) return "calm";
  if (s.state === "ACTIVE") return "focus";
  if (s.state === "ON_BREAK") return "break";
  if (s.state === "END_COUNTDOWN") return "ending";
  if (s.state === "IDLE_PAUSED") return "away";
  if (s.state === "ENDED") return "done";
  return "calm";
};

async function render(): Promise<void> {
  window.clearInterval(tick);
  const snap = await getSnapshot();
  const { session: s, history } = snap;
  setMood(moodFor(s));
  // The entrance plays when the view changes, not on every update.
  const view = s?.state ?? "IDLE";
  if (view !== lastView) {
    lastView = view;
    playEnter();
  }
  let nodes: Node[];
  if (!s || s.state === "IDLE") {
    setFooter();
    nodes = idleView(snap);
  } else if (s.state === "INFERRING") {
    setFooter();
    nodes = [hero({ text: "Starting" }, "Reading what’s open…", "Working out what you’re focused on.")];
  } else if (s.state === "SWEEP_PREVIEW") nodes = startView(s, history);
  else if (s.state === "ENDED") nodes = endedView(s);
  else nodes = runningView(s, snap);
  const focused = document.activeElement?.getAttribute("aria-label");
  main.replaceChildren(...nodes);
  if (focused) main.querySelector<HTMLElement>(`[aria-label="${CSS.escape(focused)}"]`)?.focus();
}

onStateChange(() => void render());
void render();
