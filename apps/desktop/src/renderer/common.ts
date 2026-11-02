// Shared helpers for the app's pages. Style rules (UI-06): one color per task, whitespace,
// calm colors, dark mode, no badges or confetti.

import { BRAND, MS } from "@lockin/core";
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

/** Brand header with an optional status pill. */
export function topbar(status?: { text: string; tone?: "live" | "warn" }): HTMLElement {
  const mark = h("img", { className: "mark", src: "icons/logo.svg", alt: "" });
  const brand = h("div", { className: "brand" }, mark, BRAND.NAME);
  const pill = status ? h("span", { className: `pill${status.tone ? " " + status.tone : ""}`, textContent: status.text }) : null;
  const here = location.pathname.replace(/^\//, "").replace(/\.html$/, "");
  const nav = h("nav", { className: "nav" });
  for (const [page, label] of [["session", "Session"], ["report", "Report"], ["settings", "Settings"]] as const) {
    nav.append(h("a", { href: `${page}.html`, textContent: label, className: here === page ? "on" : "", attrs: here === page ? { "aria-current": "page" } : {} }));
  }
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

/** A progress ring toward the time goal (Q-64). Call update() every second. */
export function goalRing(): { el: HTMLElement; update: (elapsedMs: number, goalMin: number | null, label: string) => void } {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 120 120");
  svg.setAttribute("aria-hidden", "true");
  svg.innerHTML =
        '<circle class="track" cx="60" cy="60" r="52" fill="none" stroke-width="10"/>' +
    '<circle class="bar" cx="60" cy="60" r="52" fill="none" stroke-width="10"/>';
  const bar = svg.querySelector<SVGCircleElement>(".bar")!;
  const length = 2 * Math.PI * 52;
  bar.style.strokeDasharray = String(length);
  const time = h("div", { className: "timer", attrs: { role: "timer" } });
  const sub = h("div", { className: "goal" });
  const el = h("div", { className: "ring" }, h("div", { className: "center" }, h("div", {}, time, sub)));
  el.prepend(svg);
  return {
    el,
    update(elapsedMs, goalMin, label) {
      const frac = goalMin ? Math.min(1, elapsedMs / (goalMin * MS.MINUTE)) : 0;
      bar.style.strokeDashoffset = String(length * (1 - frac));
      time.textContent = formatDuration(elapsedMs);
      sub.textContent = label;
    },
  };
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
