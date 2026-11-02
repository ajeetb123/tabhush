// The way out of a running session (Q-69), shared by the popup and the session page.
//   Past the goal: Stop ends at once.
//   The owner's dev install: End ends at once, any time.
//   Everyone else, before the goal: Step away (pause; blocks stay on) or the Emergency stop
//   (a one-line reason, retype a passage with no pasting, hold 3 s, a 60 s countdown, once a day).

import { DESKTOP, OWNER_RULES } from "@lockin/core";
import type { EndAccess } from "../shared/types";
import { call, h } from "./common";

export function stopButton(block = true): HTMLElement {
  const stop = h("button", { className: `btn primary${block ? " block" : ""}`, textContent: "Stop, I’m done" });
  stop.addEventListener("click", () => void call({ type: "stop" }));
  return stop;
}

function reasonField(placeholder: string, label: string): HTMLInputElement {
  return h("input", { type: "text", placeholder, attrs: { "aria-label": label } });
}

/** The owner's copy: End right now, still with a one-line reason for the log. */
function devEnd(): HTMLElement {
  const reason = reasonField("Why end now? (one line)", "Reason for ending");
  const end = h("button", { className: "btn danger", textContent: "End now" });
  const err = h("p", { className: "error", attrs: { role: "alert" } });
  const submit = () =>
    void call<boolean>({ type: "end", reason: reason.value }).then((ok) => {
      if (!ok) err.textContent = "Add a one-line reason.";
    });
  end.addEventListener("click", submit);
  reason.addEventListener("keydown", (e) => e.key === "Enter" && submit());
  return h("div", { className: "stack" }, h("p", { className: "muted small", textContent: "Developer build: you can end any time." }), reason, h("div", { className: "row" }, end), err);
}

export function stepAwayButton(block = true): HTMLElement {
  const away = h("button", { className: `btn${block ? " block" : ""}`, textContent: "Step away" });
  away.addEventListener("click", () => void call({ type: "stepAway" }));
  return away;
}

/** A button that only fires after being held down for `ms`; a fill shows the progress. */
function holdButton(text: string, ms: number, onDone: () => void): HTMLButtonElement {
  const fill = h("span", { className: "hold-fill" });
  const btn = h("button", { className: "btn danger hold block", attrs: { "aria-label": `${text} (press and hold)` } }, fill, h("span", { className: "hold-text", textContent: text }));
  let timer: number | undefined;
  const cancel = () => {
    window.clearTimeout(timer);
    fill.style.transition = "width 150ms ease";
    fill.style.width = "0%";
  };
  const begin = (e: Event) => {
    e.preventDefault();
    if (btn.disabled) return;
    fill.style.transition = `width ${ms}ms linear`;
    fill.style.width = "100%";
    timer = window.setTimeout(() => {
      cancel();
      onDone();
    }, ms);
  };
  btn.addEventListener("pointerdown", begin);
  btn.addEventListener("pointerup", cancel);
  btn.addEventListener("pointerleave", cancel);
  btn.addEventListener("pointercancel", cancel);
  // Keyboard: hold Space or Enter.
  btn.addEventListener("keydown", (e) => {
    if ((e.key === " " || e.key === "Enter") && !e.repeat) begin(e);
  });
  btn.addEventListener("keyup", (e) => (e.key === " " || e.key === "Enter") && cancel());
  return btn;
}

function emergency(left: number): HTMLElement {
  const wrap = h("div", { className: "stack" });
  const open = h("button", { className: "linkish small", textContent: "Real emergency?" });
  const panel = h("div", { className: "card stack emergency", hidden: true });
  open.addEventListener("click", () => {
    panel.hidden = !panel.hidden;
    if (!panel.hidden) panel.querySelector("input")?.focus();
  });
  if (left < 1) {
    panel.append(h("p", { className: "muted small", textContent: "You’ve used today’s emergency stop. Step away pauses the clock, and the session ends once you hit your goal." }));
  } else {
    const reason = reasonField("What’s going on? (one line)", "Emergency reason");
    // Q-70: the task. Retype the passage exactly; pasting and dropping text are blocked.
    const passage = h("blockquote", { className: "passage", textContent: DESKTOP.EMERGENCY_PASSAGE });
    const typed = h("textarea", { rows: 4, placeholder: "Type the passage above, word for word", attrs: { "aria-label": "Type the passage", spellcheck: "false", autocomplete: "off" } });
    for (const ev of ["paste", "drop"] as const) typed.addEventListener(ev, (e) => e.preventDefault());
    const norm = (t: string) => t.replace(/[’‘]/g, "'").replace(/\s+/g, " ").trim();
    const progress = h("p", { className: "muted small" });
    const err = h("p", { className: "error", attrs: { role: "alert" } });
    const btn = holdButton("Hold to stop", OWNER_RULES.EMERGENCY_HOLD_MS, () => {
      if (!reason.value.trim()) {
        err.textContent = "Say what’s going on first.";
        return;
      }
      void call<boolean>({ type: "emergency", reason: reason.value, typed: typed.value }).then((ok) => {
        if (!ok) err.textContent = "Couldn’t stop. Check the passage and try again.";
      });
    });
    const check = () => {
      const target = norm(DESKTOP.EMERGENCY_PASSAGE);
      const now = norm(typed.value);
      let right = 0;
      while (right < now.length && now[right] === target[right]) right++;
      const done = now === target;
      btn.disabled = !done;
      typed.classList.toggle("wrong", right < now.length);
      progress.textContent = done ? "Done. Now hold the button." : `${Math.round((right / target.length) * 100)}% typed`;
    };
    typed.addEventListener("input", check);
    check();
    panel.append(
      h("p", { className: "small", textContent: `For when you really have to go. Type the passage, then hold the button ${OWNER_RULES.EMERGENCY_HOLD_MS / 1000} seconds; it ends ${OWNER_RULES.EMERGENCY_COUNTDOWN_SEC} seconds later. Once a day, and it shows in your report.` }),
      reason,
      passage,
      typed,
      progress,
      btn,
      err,
    );
  }
  wrap.append(open, panel);
  return wrap;
}

/** Actions for an ACTIVE session. `access` is missing from a stale worker: treat as no early end. */
export function exitActions(access: EndAccess | undefined, reached: boolean): HTMLElement {
  if (reached) return h("div", { className: "stack" }, h("p", { className: "note", textContent: "You hit your goal. Stop whenever you like." }), stopButton());
  if (access?.dev) return h("div", { className: "stack" }, stepAwayButton(), devEnd());
  return h(
    "div",
    { className: "stack" },
    h("p", { className: "muted small", textContent: "No ending early. Need to leave your desk? Step away pauses your clock; blocks stay on." }),
    stepAwayButton(),
    emergency(access?.emergencyLeft ?? 0),
  );
}
