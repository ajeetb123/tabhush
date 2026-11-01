// Toolbar popup (UI-05): Start, the current task(s) and the goal ring, then Stop or End.
// Q-64: past the time goal, Stop ends at once (normal end); before it, End keeps the 30-second
// countdown and a one-line reason (Q-63).

import { EXITS, goalReached, MS } from "@lockin/core";
import { blockedCount, call, formatDuration, getSnapshot, goalRing, h, onStateChange, setTitle, stat, topbar } from "./common";

const main = document.querySelector("main")!;
let timer: number | undefined;

const openSessionPage = () => void chrome.tabs.create({ url: chrome.runtime.getURL("ui/session.html") });
const openReport = () => void chrome.tabs.create({ url: chrome.runtime.getURL("ui/report.html") });

function reportLink(): HTMLElement {
  const b = h("button", { className: "btn block", textContent: "📊  Your focus report" });
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

async function render(): Promise<void> {
  const { session: s } = await getSnapshot();
  window.clearInterval(timer);
  setTitle("");

  if (!s || s.state === "IDLE") {
    const start = h("button", { className: "btn primary block", textContent: "Start" });
    start.addEventListener("click", () => void call({ type: "ui:start" }).then(() => window.close()));
    main.replaceChildren(
      hero({ text: "Ready" }, "Time to lock in", "It reads your tabs, picks the task, and blocks the rest."),
      start,
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
    const open = h("button", { className: "btn primary block", textContent: "See summary" });
    open.addEventListener("click", openSessionPage);
    const won = s.endKind === "normal";
    main.replaceChildren(hero({ text: won ? "Goal reached" : "Ended" }, won ? "Nice work 🎯" : "Session over", s.taskLabel ?? ""), open, h("div", { className: "row", attrs: { style: "margin-top:10px" } }, reportLink()));
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
    const reached = goalReached(s.committedAt, s.goalMin, Date.now());
    ring.update(elapsed, s.goalMin, reached ? "goal reached" : s.goalMin ? `of ${s.goalMin} min` : "focused");
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
    actions,
  );
}

onStateChange(() => void render());
void render();
