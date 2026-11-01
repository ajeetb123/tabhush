// Toolbar popup (UI-05): Start, the current task(s) and timer, End with its countdown.
// Owner rules (Q-63): no sweep undo, a 30-second End countdown.

import { EXITS, MS } from "@lockin/core";
import { blockedCount, call, formatDuration, getSnapshot, h, onStateChange, setTitle, stat, topbar } from "./common";

const main = document.querySelector("main")!;
let timer: number | undefined;

const openSessionPage = () => void chrome.tabs.create({ url: chrome.runtime.getURL("ui/session.html") });

async function incognitoNotice(): Promise<HTMLElement | null> {
  const allowed = await chrome.extension.isAllowedIncognitoAccess();
  if (allowed) return null;
  const fix = h("button", { className: "btn", textContent: "Turn it on" });
  fix.addEventListener("click", () => void chrome.tabs.create({ url: `chrome://extensions/?id=${chrome.runtime.id}` }));
  return h(
    "div",
    { className: "card small" },
    h("p", { textContent: "Incognito windows aren’t covered yet." }),
    h("p", { className: "muted", textContent: "On the extension page, switch on “Allow in Incognito”." }),
    h("div", { className: "row" }, fix),
  );
}

async function render(): Promise<void> {
  const { session: s } = await getSnapshot();
  window.clearInterval(timer);
  setTitle("");

  if (!s || s.state === "IDLE") {
    const start = h("button", { className: "btn primary block", textContent: "Start" });
    start.addEventListener("click", () => void call({ type: "ui:start" }).then(() => window.close()));
    main.replaceChildren(
      topbar({ text: "Ready" }),
      h("h1", { textContent: "Lock in on what’s in front of you" }),
      h("p", { className: "lead", textContent: "It figures out the task from your tabs and blocks what isn’t part of it." }),
      start,
      ...[await incognitoNotice()].filter((n): n is HTMLElement => n !== null),
    );
    return;
  }

  if (s.state === "INFERRING" || s.state === "CLARIFY" || s.state === "SWEEP_PREVIEW") {
    const open = h("button", { className: "btn primary block", textContent: "Finish starting" });
    open.addEventListener("click", openSessionPage);
    main.replaceChildren(
      topbar({ text: "Starting" }),
      h("h1", { textContent: s.state === "INFERRING" ? "Reading your tabs…" : "One more step" }),
      h("p", { className: "lead", textContent: "Confirm the task and what gets blocked." }),
      open,
    );
    return;
  }

  if (s.state === "ENDED") {
    const open = h("button", { className: "btn primary block", textContent: "See summary" });
    open.addEventListener("click", openSessionPage);
    main.replaceChildren(topbar({ text: "Ended" }), h("h1", { textContent: "Session ended" }), h("p", { className: "lead", textContent: s.taskLabel ?? "" }), open);
    return;
  }

  const clock = h("div", { className: "timer", attrs: { role: "timer" } });
  const ending = s.state === "END_COUNTDOWN" && s.endCountdown;
  const tick = () => {
    if (ending) {
      const left = s.endCountdown!.startedAt + EXITS.END_COUNTDOWN_SEC * MS.SECOND - Date.now();
      clock.textContent = formatDuration(left);
      clock.setAttribute("aria-label", `Session ends in ${formatDuration(left)}`);
    } else {
      clock.textContent = formatDuration(Date.now() - (s.committedAt ?? s.startedAt));
    }
  };
  tick();
  timer = window.setInterval(tick, MS.SECOND);

  const tasks = h("div", { className: "chips" }, ...(s.taskLabel ?? "").split(" + ").map((t) => h("span", { className: "chip static on", textContent: t })));
  const parts: (HTMLElement | null)[] = [
    topbar(ending ? { text: "Ending", tone: "warn" } : s.state === "SUSPENDED" ? { text: "Paused" } : { text: "Locked in", tone: "live" }),
    tasks,
    h("div", { className: "card" }, h("div", { className: "muted small", textContent: ending ? "Ends in" : "Focused for" }), clock),
    h("div", { className: "stats" }, stat(String(blockedCount(s)), "blocked so far")),
  ];

  if (ending) {
    parts.push(h("p", { className: "muted small", attrs: { role: "status" }, textContent: "Blocks stay on until the countdown finishes." }));
  } else {
    const reason = h("input", { type: "text", placeholder: "Why are you ending? (one line)", attrs: { "aria-label": "Reason for ending" } });
    const end = h("button", { className: "btn danger", textContent: `End (${EXITS.END_COUNTDOWN_SEC}s)` });
    const err = h("p", { className: "error", attrs: { role: "alert" } });
    const submit = () =>
      void call<boolean>({ type: "ui:end", reason: reason.value }).then((ok) => {
        if (!ok) err.textContent = "Add a one-line reason to end.";
      });
    end.addEventListener("click", submit);
    reason.addEventListener("keydown", (e) => e.key === "Enter" && submit());
    parts.push(h("h2", { textContent: "End session" }), reason, h("div", { className: "row", attrs: { style: "margin-top:10px" } }, end), err);
  }
  main.replaceChildren(...parts.filter((p): p is HTMLElement => p !== null));
}

onStateChange(() => void render());
void render();
