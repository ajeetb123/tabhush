// Shared helpers for extension pages. Style rules (UI-06): one color per task, whitespace,
// system font, dark mode, no badges or confetti.

import { BRAND } from "@lockin/core";
import type { ActiveSession } from "../background/session";
import type { InternalState, UserSettings } from "../background/settings";
import type { FromUi } from "../shared/messages";

export interface Snapshot {
  session: ActiveSession | null;
  settings: UserSettings;
  internal: InternalState;
}

export async function call<T = unknown>(msg: FromUi): Promise<T> {
  const res = (await chrome.runtime.sendMessage(msg)) as { ok: boolean; value?: T; error?: string };
  if (!res?.ok) throw new Error(res?.error ?? "no response");
  return res.value as T;
}

export const getSnapshot = () => call<Snapshot>({ type: "ui:get" });

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

/** Re-renders whenever the session or settings change in storage. */
export function onStateChange(render: () => void): void {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && ("session" in changes || "settings" in changes || "internal" in changes)) render();
  });
}
