// Content script (EXT-02, EXT-07). Shows the lock overlay over the page without navigating,
// reloading or unloading it (INV-17), pauses media and re-pauses it on every play event, and
// reports input COUNTS only, never content (INV-07). Accessible: labelled dialog, focus kept
// inside, full keyboard control, no motion (QA-30).

import { BRAND, MS } from "@lockin/core";
import type { FromContent, ToContent } from "../shared/messages";

const HOST_ID = `${BRAND.ID}-root`;

declare global {
  interface Window {
    __lockinContentLoaded?: boolean;
  }
}

function send(msg: FromContent): void {
  chrome.runtime.sendMessage(msg).catch(() => undefined);
}

const STYLE = `
:host { all: initial; }
.backdrop { position: fixed; inset: 0; z-index: 2147483647; background: #111; color: #f5f5f5;
  display: flex; align-items: center; justify-content: center;
  font: 16px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; }
@media (prefers-color-scheme: light) { .backdrop { background: #fafafa; color: #111; } }
.card { max-width: 28rem; padding: 2rem; }
h1 { font-size: 1.4rem; margin: 0 0 .5rem; }
p { margin: .5rem 0; }
button, textarea { font: inherit; }
button { margin: .75rem .5rem 0 0; padding: .5rem 1rem; border-radius: .4rem; border: 1px solid currentColor;
  background: transparent; color: inherit; cursor: pointer; }
button:focus-visible, textarea:focus-visible { outline: 3px solid #4c9ffe; outline-offset: 2px; }
textarea { width: 100%; box-sizing: border-box; margin-top: .75rem; padding: .5rem; border-radius: .4rem;
  border: 1px solid currentColor; background: transparent; color: inherit; }
.note { opacity: .8; }
.ask { position: fixed; top: 0; left: 0; right: 0; z-index: 2147483647; display: flex; gap: .75rem; align-items: center;
  padding: .5rem 1rem; background: #111; color: #f5f5f5; font: 14px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif; }
.ask button { margin: 0; padding: .25rem .75rem; }
* { transition: none !important; animation: none !important; }
`;

let host: HTMLElement | null = null;
let shadow: ShadowRoot | null = null;
let parked = false;

function ensureHost(): ShadowRoot {
  if (host && shadow && host.isConnected) return shadow;
  host = document.createElement("div");
  host.id = HOST_ID;
  shadow = host.attachShadow({ mode: "closed" });
  const style = document.createElement("style");
  style.textContent = STYLE;
  shadow.append(style);
  document.documentElement.append(host);
  return shadow;
}

function clear(selector: string): void {
  shadow?.querySelectorAll(selector).forEach((n) => n.remove());
}

/** The closed shadow root is unreachable from the page; tests read it through this. */
export function shadowRootForTests(): ShadowRoot | null {
  return shadow;
}

// ───────────────────────── media ─────────────────────────

function pauseAll(): void {
  document.querySelectorAll<HTMLMediaElement>("video, audio").forEach((m) => {
    if (!m.paused) m.pause();
  });
  if (document.pictureInPictureElement) void document.exitPictureInPicture().catch(() => undefined);
}

// Capturing listener: re-pause on every play event while parked (covers PiP and media keys).
document.addEventListener(
  "play",
  (e) => {
    if (parked && e.target instanceof HTMLMediaElement) e.target.pause();
  },
  true,
);

// ───────────────────────── overlay ─────────────────────────

function trapFocus(container: HTMLElement): void {
  container.addEventListener("keydown", (e) => {
    e.stopPropagation(); // keys never reach the page underneath
    if (e.key !== "Tab") return;
    const items = [...container.querySelectorAll<HTMLElement>("button, textarea")].filter((el) => !el.hidden);
    if (items.length === 0) return;
    const first = items[0]!;
    const last = items[items.length - 1]!;
    const active = shadow?.activeElement;
    if (e.shiftKey && active === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  });
}

export function showOverlay(taskLabel: string, canOverride: boolean, overrideNote?: string): void {
  parked = true;
  pauseAll();
  const root = ensureHost();
  clear(".backdrop");
  const backdrop = document.createElement("div");
  backdrop.className = "backdrop";
  backdrop.setAttribute("role", "dialog");
  backdrop.setAttribute("aria-modal", "true");
  backdrop.setAttribute("aria-labelledby", "lockin-title");
  backdrop.setAttribute("aria-describedby", "lockin-desc");
  const card = document.createElement("div");
  card.className = "card";
  const h1 = document.createElement("h1");
  h1.id = "lockin-title";
  h1.textContent = "Parked for this session";
  const desc = document.createElement("p");
  desc.id = "lockin-desc";
  desc.textContent = `${BRAND.NAME} parked this page because it doesn’t look related to “${taskLabel}”. The page is kept as it was underneath.`;
  card.append(h1, desc);
  if (overrideNote) {
    const note = document.createElement("p");
    note.className = "note";
    note.setAttribute("role", "status");
    note.textContent = overrideNote;
    card.append(note);
  }

  const form = document.createElement("form");
  const label = document.createElement("label");
  label.textContent = "Why is this for your task? (one sentence)";
  const text = document.createElement("textarea");
  text.rows = 2;
  text.required = true;
  label.append(text);
  const submit = document.createElement("button");
  submit.type = "submit";
  submit.textContent = "Submit";
  form.append(label, submit);
  form.hidden = true;
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const sentence = text.value.replace(/\s+/g, " ").trim();
    if (sentence) send({ type: "override:submit", sentence });
  });

  if (canOverride) {
    const forTask = document.createElement("button");
    forTask.type = "button";
    forTask.textContent = "This is for my task";
    forTask.addEventListener("click", () => {
      form.hidden = false;
      forTask.hidden = true;
      text.focus();
    });
    card.append(forTask, form);
  }
  const end = document.createElement("button");
  end.type = "button";
  end.textContent = "End session…";
  end.addEventListener("click", () => send({ type: "open:session" }));
  card.append(end);

  backdrop.append(card);
  // The page underneath must not scroll or receive pointer input while parked.
  for (const type of ["wheel", "touchmove"]) backdrop.addEventListener(type, (e) => e.preventDefault(), { passive: false });
  trapFocus(backdrop);
  root.append(backdrop);
  (card.querySelector("button") as HTMLButtonElement | null)?.focus();
}

export function hideOverlay(): void {
  parked = false;
  clear(".backdrop");
}

// ───────────────────────── ask ─────────────────────────

export function showAsk(taskLabel: string): void {
  const root = ensureHost();
  clear(".ask");
  const bar = document.createElement("div");
  bar.className = "ask";
  bar.setAttribute("role", "region");
  bar.setAttribute("aria-label", `${BRAND.NAME} question`);
  bar.setAttribute("aria-live", "polite");
  const q = document.createElement("span");
  q.textContent = `Is this for the ${taskLabel}?`;
  const yes = document.createElement("button");
  yes.type = "button";
  yes.textContent = "Yes";
  yes.addEventListener("click", () => send({ type: "ask:answer", related: true }));
  const no = document.createElement("button");
  no.type = "button";
  no.textContent = "No";
  no.addEventListener("click", () => send({ type: "ask:answer", related: false }));
  bar.append(q, yes, no);
  root.append(bar);
}

// ───────────────────────── input counts (CLS-62) ─────────────────────────

let minuteStart = Math.floor(Date.now() / MS.MINUTE) * MS.MINUTE;
let count = 0;

function flush(): void {
  if (count > 0) send({ type: "input:counts", minuteStart, count });
  count = 0;
  minuteStart = Math.floor(Date.now() / MS.MINUTE) * MS.MINUTE;
}

function onInput(e: Event): void {
  if (!e.isTrusted) return;
  if (Math.floor(Date.now() / MS.MINUTE) * MS.MINUTE !== minuteStart) flush();
  count++; // a count only: no key, target or text is ever read
}

if (!window.__lockinContentLoaded) {
  window.__lockinContentLoaded = true;
  for (const type of ["keydown", "mousedown", "wheel"]) window.addEventListener(type, onInput, { capture: true, passive: true });
  setInterval(flush, MS.MINUTE);
  window.addEventListener("pagehide", flush);

  chrome.runtime.onMessage.addListener((msg: ToContent, _sender, sendResponse) => {
    switch (msg.type) {
      case "overlay:show":
        showOverlay(msg.taskLabel, msg.canOverride, msg.overrideNote);
        break;
      case "overlay:hide":
        hideOverlay();
        break;
      case "ask:show":
        showAsk(msg.taskLabel);
        break;
      case "ask:hide":
        clear(".ask");
        break;
    }
    sendResponse(true);
    return false;
  });
  send({ type: "content:ready" });
}
