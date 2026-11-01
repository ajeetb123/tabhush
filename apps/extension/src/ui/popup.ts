// Toolbar popup (UI-05, beta 1 subset): Start, current task and timer, sweep undo, End.
// Switch task, Break and the AI cap counter are beta 2.

import { EXITS, MS, SWEEP } from "@lockin/core";
import { call, formatDuration, getSnapshot, h, onStateChange, setTitle } from "./common";

const main = document.querySelector("main")!;
let timer: number | undefined;

async function render(): Promise<void> {
  const { session: s } = await getSnapshot();
  window.clearInterval(timer);
  main.replaceChildren();
  setTitle("");

  if (!s || s.state === "IDLE") {
    const start = h("button", { className: "primary", textContent: "Start" });
    start.addEventListener("click", () => void call({ type: "ui:start" }).then(() => window.close()));
    main.append(h("p", { className: "muted", textContent: "Start from wherever you are." }), start);
    return;
  }

  if (s.state === "INFERRING" || s.state === "CLARIFY" || s.state === "SWEEP_PREVIEW") {
    const open = h("button", { className: "primary", textContent: "Finish starting" });
    open.addEventListener("click", () => void chrome.tabs.create({ url: chrome.runtime.getURL("ui/session.html") }));
    main.append(h("p", { textContent: s.state === "INFERRING" ? "Figuring out the task…" : "Your session is waiting for you." }), open);
    return;
  }

  if (s.state === "ENDED") {
    const open = h("button", { className: "primary", textContent: "Session summary" });
    open.addEventListener("click", () => void chrome.tabs.create({ url: chrome.runtime.getURL("ui/session.html") }));
    main.append(h("p", { textContent: "Session ended." }), open);
    return;
  }

  const clock = h("div", { className: "big" });
  const tick = () => {
    if (s.state === "END_COUNTDOWN" && s.endCountdown) {
      const left = s.endCountdown.startedAt + EXITS.END_COUNTDOWN_SEC * MS.SECOND - Date.now();
      clock.textContent = formatDuration(left);
      clock.setAttribute("aria-label", `Session ends in ${formatDuration(left)}`);
    } else {
      clock.textContent = formatDuration(Date.now() - (s.committedAt ?? s.startedAt));
    }
  };
  tick();
  timer = window.setInterval(tick, MS.SECOND);
  main.append(h("p", {}, h("span", { className: "chip", textContent: s.taskLabel ?? "" })), clock);

  if (s.state === "SUSPENDED") main.append(h("p", { textContent: "Suspended: a proctoring tool is running." }));

  if (s.state === "END_COUNTDOWN") {
    main.append(h("p", { className: "muted", attrs: { role: "status" }, textContent: "Ending. Locks stay on until the countdown finishes." }));
    return;
  }

  if (s.committedAt !== null && Date.now() - s.committedAt <= SWEEP.UNDO_WINDOW_SEC * MS.SECOND) {
    const undo = h("button", { textContent: "Undo sweep" });
    undo.addEventListener("click", () => void call({ type: "ui:undo" }));
    main.append(h("div", { className: "row" }, undo));
  }

  const reason = h("input", { type: "text", placeholder: "One line: why are you ending?", attrs: { "aria-label": "Reason for ending" } });
  const end = h("button", { textContent: "End session" });
  const err = h("p", { className: "error", attrs: { role: "alert" } });
  end.addEventListener("click", () => {
    void call<boolean>({ type: "ui:end", reason: reason.value }).then((ok) => {
      if (!ok) err.textContent = "Add a one-line reason to end.";
    });
  });
  main.append(h("h2", { textContent: "End" }), reason, h("div", { className: "row" }, end), err);
}

onStateChange(() => void render());
void render();
