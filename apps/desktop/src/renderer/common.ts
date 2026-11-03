// Shared helpers for the app's pages. Style rules (UI-06): one color per task, whitespace,
// calm colors, dark mode, no badges or confetti.

import { BRAND, MS } from "@tabhush/core";
import type { Session, Snapshot, UiMessage } from "../shared/types";

export type { Snapshot } from "../shared/types";

declare global {
  interface Window {
    tabhush: {
      call: (msg: UiMessage) => Promise<unknown>;
      onChange: (cb: () => void) => void;
      onEmbed: (handler: (texts: string[]) => Promise<number[][]>) => void;
    };
  }
}

export async function call<T = unknown>(msg: UiMessage): Promise<T> {
  return (await window.tabhush.call(msg)) as T;
}

export const getSnapshot = () => call<Snapshot>({ type: "get" });

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> & { attrs?: Record<string, string> } = {},
  ...children: (Node | string | null | undefined | false)[]
): HTMLElementTagNameMap[K] {
  const { attrs, ...rest } = props;
  const el = Object.assign(document.createElement(tag), rest);
  for (const [k, v] of Object.entries(attrs ?? {})) el.setAttribute(k, v);
  for (const c of children) if (c) el.append(c);
  return el;
}

export function setTitle(page: string): void {
  document.title = page ? `${page} · ${BRAND.NAME}` : BRAND.NAME;
}

export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hh = Math.floor(total / 3600);
  const mm = Math.floor((total % 3600) / 60);
  const ss = total % 60;
  const two = (n: number) => String(n).padStart(2, "0");
  return hh > 0 ? `${hh}:${two(mm)}:${two(ss)}` : `${mm}:${two(ss)}`;
}

/** Re-renders whenever the app says the session or settings changed. */
export function onStateChange(render: () => void): void {
  window.tabhush.onChange(render);
}

// ───────────────────────── atmosphere (Q-73) ─────────────────────────

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** The slow ambient light behind every page, added once. */
function ambient(): void {
  if (!document.querySelector("main") || document.querySelector(".ambient")) return;
  const el = h("div", { className: "ambient", attrs: { "aria-hidden": "true" } });
  for (const c of ["a", "b", "c"]) el.append(h("div", { className: `orb ${c}` }));
  el.append(h("div", { className: "grain" }));
  document.body.prepend(el);
}
ambient();

export type Mood = "calm" | "focus" | "break" | "ending" | "away" | "done";

/** The light follows what you're doing: sage when ready, pine when locked in, amber on a break… */
export function setMood(mood: Mood): void {
  if (document.body.dataset.mood !== mood) document.body.dataset.mood = mood;
}

let enterTimer: number | undefined;

/** Plays the staggered entrance for the page's content (on load and when the view changes). */
export function playEnter(): void {
  if (reducedMotion()) return;
  document.body.classList.remove("entering");
  void document.body.offsetWidth; // restart the animation
  document.body.classList.add("entering");
  window.clearTimeout(enterTimer);
  enterTimer = window.setTimeout(() => document.body.classList.remove("entering"), 1600);
}

/** Counts a number up to its value, formatted on every frame. */
export function animateNumber(el: HTMLElement, to: number, format: (n: number) => string, ms = 1100): void {
  if (reducedMotion() || to <= 0) {
    el.textContent = format(to);
    return;
  }
  const t0 = performance.now();
  const frame = (t: number) => {
    const k = Math.min(1, (t - t0) / ms);
    const eased = 1 - Math.pow(1 - k, 4);
    el.textContent = format(to * eased);
    if (k < 1) requestAnimationFrame(frame);
  };
  el.textContent = format(0);
  requestAnimationFrame(frame);
}

const SVG_NS = "http://www.w3.org/2000/svg";

function svg(markup: string, className: string, viewBox: string): SVGSVGElement {
  const el = document.createElementNS(SVG_NS, "svg");
  el.setAttribute("viewBox", viewBox);
  el.setAttribute("class", className);
  el.setAttribute("aria-hidden", "true");
  el.innerHTML = markup;
  return el;
}

/** The logo as live SVG: the hush dot beats while you're locked in. */
function logoMark(): SVGSVGElement {
  return svg(
    '<rect width="100" height="100" rx="24" fill="#1D2125"/>' +
      '<rect x="42.5" y="24" width="15" height="54" rx="7" fill="#fff"/>' +
      '<rect x="22" y="24" width="56" height="15" rx="7" fill="#fff"/>' +
      '<circle class="dot-halo" cx="74" cy="72" r="7.5" fill="#86B5A6"/>' +
      '<circle class="dot-core" cx="74" cy="72" r="7.5" fill="#86B5A6"/>',
    "mark",
    "0 0 100 100",
  );
}

/** Slides the nav's pill from where it was on the last page to the current link. */
function placeNavPill(nav: HTMLElement, ind: HTMLElement): void {
  const on = nav.querySelector<HTMLElement>("a.on");
  if (!on) return;
  const target = { x: on.offsetLeft, w: on.offsetWidth };
  let prev: { x: number; w: number } | null = null;
  try {
    prev = JSON.parse(sessionStorage.getItem("navPill") ?? "null") as { x: number; w: number } | null;
    sessionStorage.setItem("navPill", JSON.stringify(target));
  } catch {
    prev = null;
  }
  const set = (p: { x: number; w: number }) => {
    ind.style.transform = `translateX(${p.x}px)`;
    ind.style.width = `${p.w}px`;
  };
  if (prev && (prev.x !== target.x || prev.w !== target.w) && !reducedMotion()) {
    ind.style.transition = "none";
    set(prev);
    void ind.offsetWidth;
    ind.style.transition = "";
    requestAnimationFrame(() => set(target));
  } else set(target);
}

/** Brand header with the page nav and an optional status pill. */
export function topbar(status?: { text: string; tone?: "live" | "warn" }): HTMLElement {
  const brand = h("div", { className: "brand" }, logoMark(), BRAND.NAME);
  const pill = status ? h("span", { className: `pill${status.tone ? " " + status.tone : ""}`, textContent: status.text }) : null;
  const here = location.pathname.replace(/^\//, "").replace(/\.html$/, "");
  const nav = h("nav", { className: "nav", attrs: { "aria-label": "Pages" } });
  const ind = h("span", { className: "pill-ind", attrs: { "aria-hidden": "true" } });
  nav.append(ind);
  for (const [page, label] of [["session", "Session"], ["report", "Report"], ["settings", "Settings"]] as const) {
    nav.append(h("a", { href: `${page}.html`, textContent: label, className: here === page ? "on" : "", attrs: here === page ? { "aria-current": "page" } : {} }));
  }
  requestAnimationFrame(() => placeNavPill(nav, ind));
  return h("header", { className: "topbar" }, brand, nav, pill);
}

export function avatar(domain: string): HTMLElement {
  return h("div", { className: "avatar", textContent: domain.replace(/^www\./, "").charAt(0) || "?", attrs: { "aria-hidden": "true" } });
}

export function stat(num: string, label: string): HTMLElement {
  return h("div", { className: "card stat" }, h("div", { className: "num", textContent: num }), h("div", { className: "lbl", textContent: label }));
}

/** Blocks so far: every closed tab and quit app. */
export function blockedCount(s: Session): number {
  return s.blockEvents.length;
}

/**
 * The goal ring (Q-64, Q-73): a gradient arc with a glowing head that travels around the dial,
 * minute ticks, and a halo that breathes while you're locked in. update() every second; `frac`
 * overrides the goal fraction (countdowns).
 */
export function goalRing(): {
  el: HTMLElement;
  update: (ms: number, goalMin: number | null, label: string, frac?: number) => void;
  setLive: (live: boolean) => void;
} {
  const R = 100;
  const C = 2 * Math.PI * R;
  let ticks = "";
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * 2 * Math.PI;
    const major = i % 5 === 0;
    const r1 = major ? 109 : 111;
    const r2 = 116;
    const x1 = 120 + r1 * Math.sin(a), y1 = 120 - r1 * Math.cos(a), x2 = 120 + r2 * Math.sin(a), y2 = 120 - r2 * Math.cos(a);
    ticks += `<line class="${major ? "major" : ""}" x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"/>`;
  }
  const art = svg(
    `<defs>
      <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="var(--ring-a)"/><stop offset="1" stop-color="var(--ring-b)"/>
      </linearGradient>
      <radialGradient id="haloGrad"><stop offset="0" stop-color="var(--ring-a)" stop-opacity=".28"/><stop offset="1" stop-color="var(--ring-a)" stop-opacity="0"/></radialGradient>
      <filter id="ringGlow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="2.4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    </defs>
    <circle class="halo" cx="120" cy="120" r="92"/>
    <g class="ticks">${ticks}</g>
    <circle class="track" cx="120" cy="120" r="${R}" fill="none" stroke-width="12"/>
    <circle class="arc" cx="120" cy="120" r="${R}" fill="none" stroke-width="12" transform="rotate(-90 120 120)" stroke-dasharray="${C}" stroke-dashoffset="${C}"/>
    <g class="head" style="transform-origin:120px 120px"><circle class="glow" cx="120" cy="20" r="11"/><circle class="core" cx="120" cy="20" r="7"/></g>`,
    "",
    "0 0 240 240",
  );
  const arc = art.querySelector<SVGCircleElement>(".arc")!;
  const head = art.querySelector<SVGGElement>(".head")!;
  const time = h("div", { className: "timer", attrs: { role: "timer" } });
  const sub = h("div", { className: "goal" });
  const el = h("div", { className: "ring instant" }, h("div", { className: "center" }, h("div", {}, time, sub)));
  el.prepend(art);
  let first = true;
  return {
    el,
    update(ms, goalMin, label, frac) {
      const f = Math.max(0, Math.min(1, frac ?? (goalMin ? ms / (goalMin * MS.MINUTE) : 0)));
      arc.style.strokeDashoffset = String(C * (1 - f));
      head.style.transform = `rotate(${f * 360}deg)`;
      head.style.opacity = f > 0.002 ? "1" : "0";
      time.textContent = formatDuration(ms);
      sub.textContent = label;
      if (first) {
        first = false;
        // The first paint draws the arc in from zero, after the entrance.
        if (!reducedMotion()) {
          arc.style.strokeDashoffset = String(C);
          head.style.transform = "rotate(0deg)";
          requestAnimationFrame(() => {
            el.classList.remove("instant");
            requestAnimationFrame(() => {
              arc.style.strokeDashoffset = String(C * (1 - f));
              head.style.transform = `rotate(${f * 360}deg)`;
            });
          });
        } else el.classList.remove("instant");
      }
    },
    setLive(live) {
      el.classList.toggle("is-live", live);
    },
  };
}

/** The animated focus orb on the Start screen: rings turning, motes drifting into a breathing core. */
export function focusOrb(): HTMLElement {
  let motes = "";
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * 2 * Math.PI + (i % 3) * 0.3;
    const r = 118 + (i % 4) * 12;
    const x = 150 + r * Math.cos(a), y = 150 + r * Math.sin(a);
    const dx = ((150 - x) * 0.72).toFixed(1), dy = ((150 - y) * 0.72).toFixed(1);
    motes += `<circle class="mote" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(1.6 + (i % 3) * 0.7).toFixed(1)}" fill="var(--accent)" style="--dx:${dx}px;--dy:${dy}px;animation-delay:${(i * 0.43).toFixed(2)}s;animation-duration:${(5 + (i % 4)).toFixed(1)}s"/>`;
  }
  const art = svg(
    `<defs>
      <radialGradient id="orbCore" cx=".38" cy=".34" r=".75">
        <stop offset="0" stop-color="#ffffff" stop-opacity=".95"/>
        <stop offset=".35" stop-color="var(--accent-2)"/>
        <stop offset="1" stop-color="var(--accent)"/>
      </radialGradient>
      <radialGradient id="orbGlow"><stop offset="0" stop-color="var(--accent-2)" stop-opacity=".5"/><stop offset=".6" stop-color="var(--accent-2)" stop-opacity=".12"/><stop offset="1" stop-color="var(--accent-2)" stop-opacity="0"/></radialGradient>
      <linearGradient id="orbRing" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="var(--accent)" stop-opacity=".9"/><stop offset="1" stop-color="var(--accent-2)" stop-opacity=".18"/></linearGradient>
      <filter id="orbBlur" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="16"/></filter>
    </defs>
    <circle cx="150" cy="150" r="140" fill="url(#orbGlow)"/>
    <g class="spin-slow"><circle cx="150" cy="150" r="132" fill="none" stroke="url(#orbRing)" stroke-width="1.4" stroke-dasharray="1.5 6" stroke-linecap="round"/></g>
    <g class="spin-rev"><circle cx="150" cy="150" r="108" fill="none" stroke="url(#orbRing)" stroke-width="1.4" stroke-dasharray="60 18 4 18"/></g>
    <g class="spin-mid"><circle cx="150" cy="150" r="84" fill="none" stroke="url(#orbRing)" stroke-width="2.4" stroke-linecap="round" stroke-dasharray="150 378"/><circle cx="234" cy="150" r="4" fill="var(--accent)"/><circle cx="234" cy="150" r="9" fill="var(--accent)" opacity=".18"/></g>
    ${motes}
    <g class="core"><circle cx="150" cy="158" r="58" fill="var(--accent)" opacity=".38" filter="url(#orbBlur)"/><circle cx="150" cy="150" r="52" fill="url(#orbCore)"/><circle cx="150" cy="150" r="52" fill="none" stroke="#fff" stroke-opacity=".35"/></g>
    <g class="shine"><ellipse cx="134" cy="128" rx="20" ry="11" fill="#fff" opacity=".35" transform="rotate(-30 134 128)"/></g>`,
    "",
    "0 0 300 300",
  );
  return h("div", { className: "orb-stage", attrs: { "aria-hidden": "true" } }, art);
}

/** "https://canvas.vt.edu/courses/1, notion.so" → ["canvas.vt.edu", "notion.so"]. */
export function domainsFrom(text: string): string[] {
  const out = text
    .split(/[\s,]+/)
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean)
    .map((t) => {
      try {
        return new URL(t.includes("://") ? t : `https://${t}`).hostname.replace(/^www\./, "");
      } catch {
        return "";
      }
    })
    .filter((d) => d.includes("."));
  return [...new Set(out)];
}
