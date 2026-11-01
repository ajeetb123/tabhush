// Toolbar popup (UI-05): Start, the current task(s) and the goal ring, then Stop or End.
// Q-64: past the time goal, Stop ends at once (normal end); before it, End keeps the 30-second
// countdown and a one-line reason (Q-63).

import { BREAKS, breakMinutesAvailable, EXITS, goalReached, MS } from "@lockin/core";
import { asSessionLike, focusSplit } from "./reportData";
import { BUILD_ID } from "../shared/build";
import { blockedCount, call, formatDuration, getSnapshot, goalRing, h, onStateChange, setTitle, stat, topbar } from "./common";

const main = document.querySelector("main")!;
let timer: number | undefined;

const openSessionPage = () => void chrome.tabs.create({ url: chrome.runtime.getURL("ui/session.html") });
const openReport = () => void chrome.tabs.create({ url: chrome.runtime.getURL("ui/report.html") });

function reportLink(): HTMLElement {
  const b = h("button", { className: "btn block", textContent: "Your focus report" });
  b.addEventListener("click", openReport);
  return b;
}

function hero(pill: Parameters<typeof topbar>[0], title: string, lead?: string): HTMLElement {
  return h("div", { className: "hero" }, topbar(pill), h("h1", { textContent: title }), lead ? h("p", { className: "lead", textContent: lead }) : null);
}

async function incognitoNotice(): Promise<HTMLElement | null> {
  if (await chrome.extension.isAllowedIncognitoAccess()) return null;
  const fix = h("button", { className: "btn", textContent: "Turn it on" });
  fix.addEventListener("click", () => void chrome.tabs.create({ url: `chrome://extensions/?id=${chrome.runtime.id}` }));
  return h("div", { className: "card small spread" }, h("span", { className: "muted", textContent: "Incognito isn’t covered yet." }), fix);
}

/** Start, reporting a failure instead of doing nothing. */
function startButton(text: string): HTMLElement {
  const start = h("button", { className: "btn primary block", textContent: text });
  const err = h("p", { className: "error", attrs: { role: "alert" } });
  start.addEventListener("click", () => {
    start.disabled = true;
    void call({ type: "ui:start" })
      .then(getSnapshot)
      .then((snap) => {
        if (snap.session && snap.session.state !== "IDLE" && snap.session.state !== "ENDED") return window.close();
        err.textContent = "Couldn’t start. Reload Tabhush on chrome://extensions and try again.";
        start.disabled = false;
      })
      .catch((e: Error) => {
        err.textContent = `Couldn’t start: ${e.message}`;
        start.disabled = false;
      });
  });
  return h("div", {}, start, err);
}

/** Breaks (LOOP-08): 5, 10 or 15 minutes, earned at 1 minute per 5 on task (Q-34). Never a bail. */
function breakCard(s: NonNullable<Awaited<ReturnType<typeof getSnapshot>>["session"]>): HTMLElement {
  const used = (s.breaks ?? []).reduce((sum, b) => sum + b.plannedMin, 0);
  const available = breakMinutesAvailable(focusSplit(asSessionLike(s), Date.now()).on, used);
  const buttons = BREAKS.OPTIONS_MIN.map((m) => {
    const b = h("button", { className: "chip", textContent: `${m} min`, disabled: available < m });
    b.addEventListener("click", () => void call({ type: "ui:break", min: m }));
    return b;
  });
  const note = available >= BREAKS.OPTIONS_MIN[0]
    ? `${available} min of break earned`
    : `Breaks unlock as you work: 1 min for every ${BREAKS.FOCUSED_MIN_PER_BREAK_MIN} focused`;
  return h("div", { className: "card stack" }, h("div", { className: "spread" }, h("b", { textContent: "Break" }), h("span", { className: "muted small", textContent: note })), h("div", { className: "chips" }, ...buttons));
}

/** The service worker is still running an older build than this popup (unpacked rebuild, no reload). */
function staleNotice(): HTMLElement {
  const reload = h("button", { className: "btn primary block", textContent: "Finish update" });
  reload.addEventListener("click", () => chrome.runtime.reload());
  return h("div", { className: "stack" }, h("p", { className: "note", textContent: "Tabhush was updated. Finish the update to keep going." }), reload);
}

async function render(): Promise<void> {
  const snap = await getSnapshot();
  const { session: s } = snap;
  window.clearInterval(timer);
  setTitle("");

  // INV-14: never reload mid-session; only offer it when nothing is running.
  const idle = !s || s.state === "IDLE" || s.state === "ENDED";
  if (idle && snap.buildId !== BUILD_ID) {
    main.replaceChildren(hero({ text: "Update" }, "Almost ready", "One click and you’re on the new version."), staleNotice());
    return;
  }

  if (!s || s.state === "IDLE") {
    main.replaceChildren(
      hero({ text: "Ready" }, "Time to lock in", "It reads your tabs, picks the task, and blocks the rest."),
      startButton("Start"),
      h("div", { className: "row", attrs: { style: "margin-top:10px" } }, reportLink()),
      ...[await incognitoNotice()].filter((n): n is HTMLElement => n !== null),
    );
    return;
  }

  if (s.state === "INFERRING" || s.state === "CLARIFY" || s.state === "SWEEP_PREVIEW") {
    const open = h("button", { className: "btn primary block", textContent: "Finish starting" });
    open.addEventListener("click", openSessionPage);
    main.replaceChildren(hero({ text: "Starting" }, s.state === "INFERRING" ? "Reading your tabs…" : "Almost there", "Pick your time and lock in."), open);
    return;
  }

  if (s.state === "ENDED") {
    const start = startButton("Start a new session");
    const open = h("button", { className: "btn block", textContent: "See last session’s summary" });
    open.addEventListener("click", openSessionPage);
    const won = s.endKind === "normal";
    main.replaceChildren(
      hero({ text: won ? "Goal reached" : "Ended" }, won ? "Session complete" : "Session over", s.taskLabel ?? ""),
      start,
      h("div", { className: "stack", attrs: { style: "margin-top:10px" } }, open, reportLink()),
    );
    return;
  }

  const breaks = s.breaks ?? [];
  const breakTotal = (now: number) => breaks.reduce((sum, b) => sum + ((b.endedAt ?? now) - b.startedAt), 0);

  if (s.state === "ON_BREAK") {
    const current = breaks[breaks.length - 1]!;
    const back = h("button", { className: "btn primary block", textContent: "Back to work" });
    back.addEventListener("click", () => void call({ type: "ui:breakEnd" }));
    const ring = goalRing();
    const tick = () => {
      const left = Math.max(0, current.startedAt + current.plannedMin * MS.MINUTE - Date.now());
      ring.update(left, null, "of break left");
    };
    tick();
    timer = window.setInterval(tick, MS.SECOND);
    main.replaceChildren(
      hero({ text: "On a break" }, "Take a breather", "Everything’s unlocked. It locks again on its own."),
      ring.el,
      back,
    );
    return;
  }

  const ending = s.state === "END_COUNTDOWN" && s.endCountdown;
  const ring = goalRing();
  const actions = h("div", { className: "stack" });
  let shownReached: boolean | null = null;

  const renderActions = (reached: boolean) => {
    if (ending) {
      actions.replaceChildren(h("p", { className: "muted small", attrs: { role: "status" }, textContent: "Blocks stay on until the countdown finishes." }));
    } else if (reached) {
      const stop = h("button", { className: "btn primary block", textContent: "Stop, I’m done" });
      stop.addEventListener("click", () => void call({ type: "ui:stop" }));
      actions.replaceChildren(h("p", { className: "note", textContent: "You hit your goal. You’re locked in, so stop whenever you like." }), stop);
    } else {
      const reason = h("input", { type: "text", placeholder: "Why end early? (one line)", attrs: { "aria-label": "Reason for ending" } });
      const end = h("button", { className: "btn danger", textContent: `End early (${EXITS.END_COUNTDOWN_SEC}s)` });
      const err = h("p", { className: "error", attrs: { role: "alert" } });
      const submit = () =>
        void call<boolean>({ type: "ui:end", reason: reason.value }).then((ok) => {
          if (!ok) err.textContent = "Add a one-line reason to end early.";
        });
      end.addEventListener("click", submit);
      reason.addEventListener("keydown", (e) => e.key === "Enter" && submit());
      actions.replaceChildren(reason, h("div", { className: "row" }, end), err);
    }
  };

  const soFar = stat("", "so far");
  const tick = () => {
    const elapsed = Date.now() - (s.committedAt ?? s.startedAt);
    soFar.querySelector(".num")!.textContent = formatDuration(elapsed);
    if (ending) {
      const left = Math.max(0, s.endCountdown!.startedAt + EXITS.END_COUNTDOWN_SEC * MS.SECOND - Date.now());
      ring.update(left, null, "until it ends");
      return;
    }
    const reached = goalReached(s.committedAt, s.goalMin, Date.now(), breakTotal(Date.now()));
    ring.update(elapsed - breakTotal(Date.now()), s.goalMin, reached ? "goal reached" : s.goalMin ? `of ${s.goalMin} min` : "focused");
    if (reached !== shownReached) {
      shownReached = reached;
      renderActions(reached);
    }
  };
  if (ending) renderActions(false);
  tick();
  timer = window.setInterval(tick, MS.SECOND);

  main.replaceChildren(
    hero(ending ? { text: "Ending", tone: "warn" } : { text: "Locked in", tone: "live" }, s.taskLabel ?? "Locked in"),
    ring.el,
    h("div", { className: "stats" }, stat(String(blockedCount(s)), "blocked"), soFar),
    ...(ending ? [] : [breakCard(s)]),
    actions,
  );
}

onStateChange(() => void render());
void render();
