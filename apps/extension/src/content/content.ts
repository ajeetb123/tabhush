// Content script (EXT-02, EXT-07). Shows the lock overlay over the page without navigating,
// reloading or unloading it (INV-17), pauses media and re-pauses it on every play event, and
// reports input COUNTS only, never content (INV-07). Accessible: labelled dialog, focus kept
// inside, full keyboard control, no motion (QA-30).
// Owner rules (Q-63): allowed music plays at a lower volume; YouTube's genre for the playing
// video is reported so music can be recognized.

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
* { box-sizing: border-box; transition: none !important; animation: none !important; }
.backdrop {
  position: fixed; inset: 0; z-index: 2147483647;
  display: flex; align-items: center; justify-content: center; padding: 24px;
  background: radial-gradient(1200px 600px at 50% -10%, #2a2f6b 0%, #12131a 55%, #0b0c10 100%);
  color: #eef0f6;
  font: 15px/1.55 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
}
.card {
  width: min(440px, 100%); padding: 32px 30px 26px; border-radius: 22px;
  background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.12);
  box-shadow: 0 30px 80px rgba(0,0,0,.45); text-align: center;
}
.mark {
  width: 52px; height: 52px; margin: 0 auto 18px; border-radius: 15px;
  display: grid; place-items: center; font-weight: 800; font-size: 22px; color: #fff;
  background: linear-gradient(135deg, #7c83ff, #5b5bf7 55%, #3b3bd1);
  box-shadow: 0 8px 24px rgba(91,91,247,.45);
}
h1 { font-size: 22px; line-height: 1.25; margin: 0 0 8px; font-weight: 700; letter-spacing: -.01em; }
p { margin: 6px 0; color: #b9bdcc; }
.task {
  display: inline-block; margin: 12px 0 4px; padding: 6px 14px; border-radius: 999px;
  background: rgba(124,131,255,.16); border: 1px solid rgba(124,131,255,.45); color: #dfe1ff; font-weight: 600;
}
.note { margin-top: 14px; font-size: 13px; color: #9aa0b4; }
.actions { display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; margin-top: 22px; }
button, textarea { font: inherit; }
button {
  padding: 10px 18px; border-radius: 12px; cursor: pointer; font-weight: 600;
  border: 1px solid rgba(255,255,255,.18); background: rgba(255,255,255,.06); color: #eef0f6;
}
button.primary { background: #5b5bf7; border-color: #5b5bf7; color: #fff; }
button:focus-visible, textarea:focus-visible { outline: 3px solid #a5a9ff; outline-offset: 2px; }
textarea {
  width: 100%; margin-top: 12px; padding: 10px 12px; border-radius: 12px; resize: vertical;
  border: 1px solid rgba(255,255,255,.18); background: rgba(0,0,0,.25); color: inherit;
}
.check { margin-top: 18px; padding-top: 16px; border-top: 1px solid rgba(255,255,255,.1); }
.check p { margin-bottom: 8px; color: #dfe1ff; }
.ask {
  position: fixed; top: 16px; left: 50%; transform: translateX(-50%); z-index: 2147483647;
  display: flex; gap: 10px; align-items: center; padding: 10px 12px 10px 16px; border-radius: 14px;
  background: #15161d; color: #eef0f6; border: 1px solid rgba(255,255,255,.12); box-shadow: 0 12px 40px rgba(0,0,0,.35);
  font: 14px/1.4 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
}
.ask button { padding: 6px 12px; border-radius: 10px; }
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

/** The closed shadow root is unreachable from the page; tests read it through this. */
export function shadowRootForTests(): ShadowRoot | null {
  return shadow;
}

function clear(selector: string): void {
  shadow?.querySelectorAll(selector).forEach((n) => n.remove());
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}): HTMLElementTagNameMap[K] {
  return Object.assign(document.createElement(tag), props);
}

// ───────────────────────── media ─────────────────────────

let musicVolume: number | null = null;

function lowerVolume(m: HTMLMediaElement): void {
  if (musicVolume !== null && m.volume > musicVolume) m.volume = musicVolume;
}

function pauseAll(): void {
  document.querySelectorAll<HTMLMediaElement>("video, audio").forEach((m) => {
    if (!m.paused) m.pause();
  });
  if (document.pictureInPictureElement) void document.exitPictureInPicture().catch(() => undefined);
}

// Capturing listener: re-pause on every play event while parked (covers PiP and media keys);
// for allowed music, start each new track at the lower volume.
document.addEventListener(
  "play",
  (e) => {
    if (!(e.target instanceof HTMLMediaElement)) return;
    if (parked) e.target.pause();
    else lowerVolume(e.target);
  },
  true,
);

// ───────────────────────── overlay ─────────────────────────

function trapFocus(container: HTMLElement): void {
  container.addEventListener("keydown", (e) => {
    e.stopPropagation(); // keys never reach the page underneath
    if (e.key !== "Tab") return;
    const items = [...container.querySelectorAll<HTMLElement>("button, textarea")].filter((n) => !n.hidden && !n.closest("[hidden]"));
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

export function showOverlay(taskLabel: string, canOverride: boolean, overrideNote?: string, sampledCheck = false): void {
  parked = true;
  pauseAll();
  const root = ensureHost();
  clear(".backdrop");
  const backdrop = el("div", { className: "backdrop" });
  backdrop.setAttribute("role", "dialog");
  backdrop.setAttribute("aria-modal", "true");
  backdrop.setAttribute("aria-labelledby", "lockin-title");
  backdrop.setAttribute("aria-describedby", "lockin-desc");
  const card = el("div", { className: "card" });
  const mark = el("div", { className: "mark", textContent: BRAND.NAME.charAt(0) });
  mark.setAttribute("aria-hidden", "true");
  const h1 = el("h1", { id: "lockin-title", textContent: "Blocked for this session" });
  const desc = el("p", {
    id: "lockin-desc",
    textContent: "This doesn’t look like part of what you’re locked in on. It’s paused and kept as it was, and it opens again when the session ends.",
  });
  const task = el("div", { className: "task", textContent: taskLabel });
  card.append(mark, h1, desc, task);
  if (overrideNote) {
    const note = el("p", { className: "note", textContent: overrideNote });
    note.setAttribute("role", "status");
    card.append(note);
  }

  const actions = el("div", { className: "actions" });
  card.append(actions);
  if (canOverride) {
    const form = el("form");
    form.hidden = true;
    const text = el("textarea", { rows: 2, required: true, placeholder: "Why is this for your task? (one sentence)" });
    text.setAttribute("aria-label", "Why is this for your task? (one sentence)");
    const row = el("div", { className: "actions" });
    row.append(el("button", { type: "submit", className: "primary", textContent: "Submit" }));
    form.append(text, row);
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const sentence = text.value.replace(/\s+/g, " ").trim();
      if (sentence) send({ type: "override:submit", sentence });
    });
    const forTask = el("button", { type: "button", textContent: "This is for my task" });
    forTask.addEventListener("click", () => {
      form.hidden = false;
      forTask.hidden = true;
      text.focus();
    });
    actions.append(forTask);
    card.append(form);
  }
  const end = el("button", { type: "button", textContent: "End session…" });
  end.addEventListener("click", () => send({ type: "open:session" }));
  actions.append(end);

  if (sampledCheck) {
    const check = el("div", { className: "check" });
    check.setAttribute("role", "group");
    check.setAttribute("aria-label", "Was this park right?");
    check.append(el("p", { textContent: "Was this the right call?" }));
    const row = el("div", { className: "actions" });
    for (const [label, right] of [["Yes", true], ["No", false]] as const) {
      const b = el("button", { type: "button", textContent: label });
      b.addEventListener("click", () => {
        send({ type: "check:answer", right });
        check.remove();
      });
      row.append(b);
    }
    check.append(row);
    card.append(check);
  }

  backdrop.append(card);
  // The page underneath must not scroll or receive pointer input while parked.
  for (const type of ["wheel", "touchmove"]) backdrop.addEventListener(type, (e) => e.preventDefault(), { passive: false });
  trapFocus(backdrop);
  root.append(backdrop);
  card.querySelector<HTMLButtonElement>("button:not([hidden])")?.focus();
}

export function hideOverlay(): void {
  parked = false;
  clear(".backdrop");
}

// ───────────────────────── ask (switched off by the owner, Q-63) ─────────────────────────

export function showAsk(taskLabel: string): void {
  const root = ensureHost();
  clear(".ask");
  const bar = el("div", { className: "ask" });
  bar.setAttribute("role", "region");
  bar.setAttribute("aria-label", `${BRAND.NAME} question`);
  bar.setAttribute("aria-live", "polite");
  const yes = el("button", { type: "button", textContent: "Yes" });
  yes.addEventListener("click", () => send({ type: "ask:answer", related: true }));
  const no = el("button", { type: "button", textContent: "No" });
  no.addEventListener("click", () => send({ type: "ask:answer", related: false }));
  bar.append(el("span", { textContent: `Is this for ${taskLabel}?` }), yes, no);
  root.append(bar);
}

// ───────────────────────── YouTube genre (Q-63 music rule) ─────────────────────────

let lastYoutube = "";

/** Reports YouTube's genre for the playing video, only when the page's metadata is for that video. */
function reportYoutube(): void {
  if (!/(^|\.)youtube\.com$/.test(location.hostname)) return;
  const v = new URLSearchParams(location.search).get("v");
  if (!v) return;
  const id = document.querySelector('meta[itemprop="identifier"]')?.getAttribute("content");
  const genre = id === v ? (document.querySelector('meta[itemprop="genre"]')?.getAttribute("content") ?? null) : null;
  const key = `${v}|${genre}`;
  if (key === lastYoutube) return;
  lastYoutube = key;
  send({ type: "youtube:meta", videoId: v, genre });
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
        showOverlay(msg.taskLabel, msg.canOverride, msg.overrideNote, msg.sampledCheck);
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
      case "music:on":
        musicVolume = msg.volume;
        document.querySelectorAll<HTMLMediaElement>("video, audio").forEach(lowerVolume);
        break;
      case "music:off":
        musicVolume = null;
        break;
    }
    sendResponse(true);
    return false;
  });
  send({ type: "content:ready" });
  reportYoutube();
  // YouTube changes pages without reloading; re-check its metadata when the head changes.
  if (document.head) new MutationObserver(reportYoutube).observe(document.head, { childList: true, subtree: true, attributes: true });
}
