// The report (UI-02 Today, UI-04 Week and Sessions; built early per Q-65). Design rule: one big
// number, one clear breakdown, one insight; every chart has a written takeaway.

import { BRAND, MS } from "@lockin/core";
import type { ActiveSession } from "../background/session";
import { formatDuration, getSnapshot, h, onStateChange, setTitle, topbar } from "./common";
import { asSessionLike, colorFor, dayReport, formatHm, taskKey, weekReport, type SessionLike } from "./reportData";

setTitle("Your focus");
document.querySelector("main")!.classList.add("report");
const main = document.querySelector("main")!;
type Tab = "today" | "week" | "sessions";
let tab: Tab = (new URLSearchParams(location.search).get("tab") as Tab | null) ?? "today";
let tick: number | undefined;

async function pastSessions(): Promise<SessionLike[]> {
  return new Promise((resolve) => {
    const open = indexedDB.open(BRAND.ID);
    open.onsuccess = () => {
      const db = open.result;
      if (!db.objectStoreNames.contains("sessions")) return resolve([]);
      const req = db.transaction("sessions").objectStore("sessions").getAll();
      req.onsuccess = () => resolve((req.result as ActiveSession[]).map(asSessionLike));
      req.onerror = () => resolve([]);
    };
    open.onerror = () => resolve([]);
  });
}

function hourLabel(t: number): string {
  return new Date(t).toLocaleTimeString(undefined, { hour: "numeric" }).replace(/\s/g, "").toLowerCase();
}

function todayView(sessions: SessionLike[], now: number): Node[] {
  const r = dayReport(sessions, now);
  const span = r.strip.endMs - r.strip.startMs;
  const strip = h("div", { className: "strip", attrs: { role: "img", "aria-label": `Sessions today: ${r.strip.segments.map((s) => s.label).join(", ") || "none"}` } });
  for (const seg of r.strip.segments) {
    const left = ((Math.max(seg.from, r.strip.startMs) - r.strip.startMs) / span) * 100;
    const width = ((Math.min(seg.to, r.strip.endMs) - Math.max(seg.from, r.strip.startMs)) / span) * 100;
    strip.append(h("span", { title: seg.label, attrs: { style: `left:${left}%;width:${Math.max(width, 0.6)}%;background:${seg.color}` } }));
  }
  const mid = r.strip.startMs + span / 2;
  const rows = h("ul", { className: "taskrows" });
  for (const row of r.rows) {
    rows.append(
      h(
        "li",
        {},
        h("span", { className: "dot", attrs: { style: `background:${row.color}` } }),
        h("span", { textContent: row.label }),
        h("span", { className: "t", textContent: formatHm(row.onMs) }),
        h("span", { className: "c", textContent: `${row.sessions} session${row.sessions === 1 ? "" : "s"}` }),
      ),
    );
  }
  rows.append(
    h(
      "li",
      {},
      h("span", { className: "dot hollow" }),
      h("span", { className: "muted", textContent: "Outside the browser" }),
      h("span", { className: "t muted", textContent: formatHm(r.awayMs) }),
      h("span", { className: "c", textContent: "not counted in focus %" }),
    ),
  );
  return [
    h(
      "div",
      { className: "big3" },
      h("div", {}, h("div", { className: "n hero-n", textContent: formatHm(r.focusedMs) }), h("div", { className: "l", textContent: "focused today" })),
      h("div", {}, h("div", { className: "n", textContent: r.focusPct === null ? "–" : `${r.focusPct}%` }), h("div", { className: "l", textContent: "of session time on task" })),
      h("div", {}, h("div", { className: "n", textContent: String(r.blocked) }), h("div", { className: "l", textContent: "items blocked" })),
    ),
    strip,
    h("div", { className: "strip-axis" }, h("span", { textContent: hourLabel(r.strip.startMs) }), h("span", { textContent: hourLabel(mid) }), h("span", { textContent: hourLabel(r.strip.endMs) })),
    h("h2", { textContent: "By task" }),
    rows,
    h("div", { className: "insight" }, h("b", { textContent: "Insight" }), r.insight),
  ];
}

function weekView(sessions: SessionLike[], now: number): Node[] {
  const w = weekReport(sessions, now);
  const max = Math.max(...w.days.map((d) => d.totalMs), MS.HOUR);
  const bars = h("div", { className: "weekbars", attrs: { role: "img", "aria-label": `Focused time per day this week, ${formatHm(w.totalMs)} in total` } });
  for (const d of w.days) {
    const col = h("div", { className: "col" }, h("div", { className: "val", textContent: d.totalMs ? formatHm(d.totalMs) : "" }));
    for (const p of d.parts) col.append(h("div", { className: "seg", title: `${p.label}: ${formatHm(p.onMs)}`, attrs: { style: `height:${(p.onMs / max) * 100}%;background:${p.color}` } }));
    bars.append(h("div", { className: "wk" }, col, h("div", { className: "lbl", textContent: d.label })));
  }
  return [
    h("div", { className: "big3" }, h("div", {}, h("div", { className: "n hero-n", textContent: formatHm(w.totalMs) }), h("div", { className: "l", textContent: "focused in the last 7 days" }))),
    bars,
    h("div", { className: "insight" }, h("b", { textContent: "Insight" }), w.insight),
  ];
}

function sessionsView(sessions: SessionLike[], now: number): Node[] {
  const list = [...sessions].filter((s) => s.committedAt !== null).sort((a, b) => b.committedAt! - a.committedAt!);
  if (!list.length) return [h("div", { className: "empty", textContent: "Your sessions will show up here." })];
  return list.map((s) => {
    const len = (s.endedAt ?? now) - s.committedAt!;
    const when = new Date(s.committedAt!).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" });
    const status = s.endedAt === null ? h("span", { className: "tag win", textContent: "now" }) : s.endKind === "normal" ? h("span", { className: "tag win", textContent: "goal reached" }) : h("span", { className: "tag", textContent: "ended early" });
    return h(
      "div",
      { className: "sess" },
      h("span", { className: "dot", attrs: { style: `background:${colorFor(taskKey(s))}` } }),
      h("div", {}, h("div", { textContent: s.taskLabel ?? "Untitled" }), h("div", { className: "meta" }, `${when} · ${s.blockEvents.length} blocked `, status)),
      h("div", { className: "right" }, h("div", { textContent: formatHm(len) }), h("div", { className: "meta", textContent: s.goalMin ? `goal ${s.goalMin}m` : "" })),
    );
  });
}

async function render(): Promise<void> {
  window.clearInterval(tick);
  const { session } = await getSnapshot();
  const saved = await pastSessions();
  const current = session && session.state !== "ENDED" && session.committedAt !== null ? [asSessionLike(session)] : [];
  const all = [...saved.filter((s) => s.id !== session?.id), ...current];
  const now = Date.now();

  const tabs = h("div", { className: "tabs", attrs: { role: "tablist" } });
  for (const [id, label] of [["today", "Today"], ["week", "Week"], ["sessions", "Sessions"]] as const) {
    const b = h("button", { textContent: label, attrs: { role: "tab", "aria-selected": String(tab === id) } });
    b.addEventListener("click", () => {
      tab = id;
      void render();
    });
    tabs.append(b);
  }
  const live = current[0] ? h("span", { className: "live" }) : null;
  if (live && session) {
    const update = () => (live.textContent = `${session.taskLabel ?? ""} · ${formatDuration(Date.now() - session.committedAt!)}`);
    update();
    tick = window.setInterval(update, MS.SECOND);
  }
  const body = tab === "today" ? todayView(all, now) : tab === "week" ? weekView(all, now) : sessionsView(all, now);
  main.replaceChildren(
    topbar(),
    h("h1", { textContent: "Your focus" }),
    h("p", { className: "lead", textContent: "Everything here stays on this device." }),
    h("div", { className: "card report-card" }, h("div", { className: "head" }, tabs, live), h("div", { className: "body", attrs: { role: "tabpanel" } }, ...body)),
  );
}

onStateChange(() => void render());
void render();
