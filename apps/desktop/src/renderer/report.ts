// The report (UI-02 Today, UI-04 Week and Sessions; built early per Q-65). Design rule: one big
// number, one clear breakdown, one insight; every chart has a written takeaway.

import { MS } from "@tabhush/core";
import type { ActivitySegment, Session } from "../shared/types";
import { animateNumber, avatar, call, formatDuration, getSnapshot, h, onStateChange, playEnter, setMood, setTitle, topbar } from "./common";
import { activityBlocks, activityTotals, appBreakdown, asSessionLike, dayReport, dayStart, formatHm, sessionTasks, taskColor, weekReport, type SessionLike } from "./reportData";
import { endLabel, sessionDetail } from "./sessionDetail";

setTitle("Your focus");
document.querySelector("main")!.classList.add("report");
const main = document.querySelector("main")!;
type Tab = "today" | "activity" | "week" | "sessions";
let tab: Tab = (new URLSearchParams(location.search).get("tab") as Tab | null) ?? "today";
let tick: number | undefined;

let dayOffset = 0; // Activity tab: 0 = today, 1 = yesterday, …

async function pastSessions(): Promise<SessionLike[]> {
  return ((await call<Session[]>({ type: "sessions" })) ?? []).map(asSessionLike);
}

const clock = (t: number) => new Date(t).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

/** Q-70: every app, and inside it every site or window, with time. */
function appsCard(segments: ActivitySegment[], from: number, to: number, limit?: number): Node[] {
  const apps = appBreakdown(segments, from, to);
  if (!apps.length) return [h("div", { className: "empty", textContent: "Nothing recorded yet. Tabhush logs what’s in front while it runs." })];
  const max = apps[0]!.ms;
  const list = h("ul", { className: "items sites" });
  for (const a of limit ? apps.slice(0, limit) : apps) {
    const box = h(
      "details",
      { className: "app-box" },
      h(
        "summary",
        { className: "stack tight" },
        h("div", { className: "spread" }, h("div", { className: "site" }, avatar(a.app), h("span", { textContent: a.app })), h("b", { textContent: formatHm(a.ms) })),
        h("div", { className: "bar on" }, h("span", { attrs: { style: `width:${Math.max(3, Math.round((a.ms / max) * 100))}%` } })),
      ),
    );
    const inner = h("ul", { className: "pages" });
    for (const g of a.groups.slice(0, 12)) {
      const single = g.name === a.app;
      if (!single) inner.append(h("li", { className: "spread grp" }, h("span", { className: "title", textContent: g.name }), h("span", { className: "muted", textContent: formatHm(g.ms) })));
      for (const t of g.titles.slice(0, single ? 10 : 5)) inner.append(h("li", { className: `spread${single ? "" : " sub"}` }, h("span", { className: "title", textContent: t.title }), h("span", { className: "muted", textContent: formatHm(t.ms) })));
    }
    if (!inner.childElementCount) inner.append(h("li", { className: "muted small", textContent: "No window titles for this app (private, or Accessibility is off)." }));
    box.append(inner);
    list.append(h("li", {}, box));
  }
  return [h("div", { className: "card" }, list)];
}

/** Q-74: the day as blocks (each session, and stretches of free time), each opening to its entries. */
function timelineCard(segments: ActivitySegment[], from: number, to: number, sessionLabels: Map<string, string>): Node[] {
  const blocks = activityBlocks(segments, from, to);
  if (!blocks.length) return [];
  const list = h("div", { className: "blocks" });
  for (const b of [...blocks].reverse()) {
    const name = b.sessionId ? (sessionLabels.get(b.sessionId) ?? "Session") : "Free time";
    const top = b.top.slice(0, 3).map((t) => t.label).join(", ") + (b.top.length > 3 ? `, +${b.top.length - 3}` : "");
    const items = h("ol", { className: "timeline" });
    for (const i of b.items.filter((x) => x.to - x.from >= 30 * MS.SECOND)) {
      const cls = i.state === "away" ? "away" : b.sessionId ? (i.onTask === false ? "off" : i.otherTask ? "other" : "on") : "free";
      const what = i.state === "away" ? "Away" : i.label + (i.otherTask ? `  (${i.otherTask})` : "");
      const sub = i.titles.length ? i.titles.slice(0, 3).join(" · ") + (i.titles.length > 3 ? ` · +${i.titles.length - 3} more` : "") : "";
      items.append(
        h(
          "li",
          { className: `tl ${cls}` },
          h("span", { className: "when", textContent: `${clock(i.from)}–${clock(i.to)}` }),
          h("span", { className: "what" }, h("span", { className: "title", textContent: what }), sub ? h("span", { className: "sub title", textContent: sub }) : null),
          h("span", { className: "muted", textContent: formatHm(i.to - i.from) }),
        ),
      );
    }
    list.append(
      h(
        "details",
        { className: `block ${b.sessionId ? "is-session" : "is-free"}` },
        h(
          "summary",
          {},
          h("span", { className: "when", textContent: `${clock(b.from)}–${clock(b.to)}` }),
          h("span", { className: "what" }, h("b", { textContent: name }), h("span", { className: "sub title", textContent: top })),
          h("span", { className: "dur", textContent: formatHm(b.activeMs) }),
        ),
        items,
      ),
    );
  }
  return [h("h2", { textContent: "Your day, block by block" }), h("div", { className: "card" }, list)];
}

async function activityView(now: number, sessions: SessionLike[]): Promise<Node[]> {
  const from = dayStart(now) - dayOffset * MS.DAY;
  const to = Math.min(now, from + MS.DAY);
  const segments = await call<ActivitySegment[]>({ type: "activity", from, to });
  const totals = activityTotals(segments, from, to);
  const prev = h("button", { className: "btn", textContent: "‹ Earlier" });
  prev.addEventListener("click", () => {
    dayOffset++;
    void render();
  });
  const next = h("button", { className: "btn", textContent: "Later ›", disabled: dayOffset === 0 });
  next.addEventListener("click", () => {
    dayOffset = Math.max(0, dayOffset - 1);
    void render();
  });
  const label = dayOffset === 0 ? "Today" : dayOffset === 1 ? "Yesterday" : new Date(from + 12 * MS.HOUR).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
  return [
    h("div", { className: "spread" }, prev, h("b", { textContent: label }), next),
    h(
      "div",
      { className: "big3" },
      h("div", {}, h("div", { className: "n hero-n", textContent: formatHm(totals.activeMs), attrs: { "data-hm": String(totals.activeMs) } }), h("div", { className: "l", textContent: "on the computer" })),
      h("div", {}, h("div", { className: "n", textContent: formatHm(totals.inSessionMs), attrs: { "data-hm": String(totals.inSessionMs) } }), h("div", { className: "l", textContent: "of it in sessions" })),
      h("div", {}, h("div", { className: "n", textContent: formatHm(totals.awayMs), attrs: { "data-hm": String(totals.awayMs) } }), h("div", { className: "l", textContent: "idle or away" })),
    ),
    h("h2", { textContent: "Apps, sites and windows" }),
    ...appsCard(segments, from, to),
    ...timelineCard(segments, from, to, new Map(sessions.map((s) => [s.id, s.taskLabel ?? "Session"]))),
  ];
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
        h("span", {
          className: "c",
          textContent: [row.sessions ? `${row.sessions} session${row.sessions === 1 ? "" : "s"}` : "", row.sideMs ? `${formatHm(row.sideMs)} as side work` : ""].filter(Boolean).join(" · "),
        }),
      ),
    );
  }
  return [
    h(
      "div",
      { className: "big3" },
      h("div", {}, h("div", { className: "n hero-n", textContent: formatHm(r.focusedMs), attrs: { "data-hm": String(r.focusedMs) } }), h("div", { className: "l", textContent: "focused today" })),
      h("div", {}, h("div", { className: "n", textContent: r.focusPct === null ? "–" : `${r.focusPct}%`, attrs: r.focusPct === null ? {} : { "data-pct": String(r.focusPct) } }), h("div", { className: "l", textContent: "of session time on task" })),
      h("div", {}, h("div", { className: "n", textContent: String(r.blocked), attrs: { "data-n": String(r.blocked) } }), h("div", { className: "l", textContent: "items blocked" })),
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
    h("div", { className: "big3" }, h("div", {}, h("div", { className: "n hero-n", textContent: formatHm(w.totalMs), attrs: { "data-hm": String(w.totalMs) } }), h("div", { className: "l", textContent: "focused in the last 7 days" }))),
    bars,
    h("div", { className: "insight" }, h("b", { textContent: "Insight" }), w.insight),
  ];
}

const openIds = new Set<string>(); // expanded sessions survive a re-render

function sessionsView(sessions: SessionLike[], now: number): Node[] {
  const list = [...sessions].filter((s) => s.committedAt !== null).sort((a, b) => b.committedAt! - a.committedAt!);
  if (!list.length) return [h("div", { className: "empty", textContent: "Your sessions will show up here." })];
  return list.map((s) => {
    const len = (s.endedAt ?? now) - s.committedAt!;
    const when = new Date(s.committedAt!).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" });
    const won = s.endedAt === null || s.endKind === "normal";
    const status = h("span", { className: `tag${won ? " win" : ""}`, textContent: endLabel(s) });
    const row = h(
      "summary",
      { className: "sess" },
      h("span", { className: "dots" }, ...sessionTasks(s).map((t) => h("span", { className: "dot", title: t, attrs: { style: `background:${taskColor(t)}` } }))),
      h("div", {}, h("div", { textContent: s.taskLabel ?? "Untitled" }), h("div", { className: "meta" }, `${when} · ${s.blockEvents.length} blocked `, status)),
      h("div", { className: "right" }, h("div", { textContent: formatHm(len) }), h("div", { className: "meta", textContent: s.goalMin ? `goal ${s.goalMin}m` : "" })),
    );
    // Q-69: open a session for its full report (sites, pages, timeline), built on first open.
    const box = h("details", { className: "sess-box", open: openIds.has(s.id) }, row);
    const fill = () => {
      if (!box.open || box.childElementCount !== 1) return;
      const detail = sessionDetail(s, now);
      // Q-78: a test or a mistake can be taken out of the history.
      if (s.endedAt !== null) {
        const del = h("button", { className: "linkish", textContent: "Delete from history" });
        del.addEventListener("click", () => {
          if (window.confirm(`Delete “${s.taskLabel ?? "this session"}” from your report? This can’t be undone.`)) void call({ type: "deleteSession", id: s.id }).then(() => render());
        });
        detail.append(del);
      }
      box.append(detail);
    };
    box.addEventListener("toggle", () => {
      if (box.open) openIds.add(s.id);
      else openIds.delete(s.id);
      fill();
    });
    fill();
    return box;
  });
}

let counted = false;

async function render(entrance = false): Promise<void> {
  window.clearInterval(tick);
  const { session } = await getSnapshot();
  setMood(session && session.committedAt !== null && session.state === "ACTIVE" ? "focus" : "calm");
  const saved = await pastSessions();
  const current = session && session.state !== "ENDED" && session.committedAt !== null ? [asSessionLike(session)] : [];
  const all = [...saved.filter((s) => s.id !== session?.id), ...current];
  const now = Date.now();

  const tabs = h("div", { className: "tabs", attrs: { role: "tablist" } });
  for (const [id, label] of [["today", "Today"], ["activity", "Activity"], ["week", "Week"], ["sessions", "Sessions"]] as const) {
    const b = h("button", { textContent: label, attrs: { role: "tab", "aria-selected": String(tab === id) } });
    b.addEventListener("click", () => {
      if (tab === id) return;
      tab = id;
      void render(true);
    });
    tabs.append(b);
  }
  const live = current[0] ? h("span", { className: "live" }) : null;
  if (live && session) {
    const update = () => (live.textContent = `${session.taskLabel ?? ""} · ${formatDuration(Date.now() - session.committedAt!)}`);
    update();
    tick = window.setInterval(update, MS.SECOND);
  }
  const body =
    tab === "today" ? todayView(all, now) : tab === "activity" ? await activityView(now, all) : tab === "week" ? weekView(all, now) : sessionsView(all, now);
  main.replaceChildren(
    topbar(),
    h("h1", { textContent: "Your focus" }),
    h("p", { className: "lead", textContent: "Everything here stays on this device." }),
    h("div", { className: "card report-card" }, h("div", { className: "head" }, tabs, live), h("div", { className: "body", attrs: { role: "tabpanel" } }, ...body)),
  );
  // Numbers count up the first time each tab is shown (Q-73).
  if (entrance || !counted) {
    counted = true;
    if (entrance) playEnter();
    for (const el of main.querySelectorAll<HTMLElement>("[data-hm]")) animateNumber(el, Number(el.dataset.hm), formatHm);
    for (const el of main.querySelectorAll<HTMLElement>("[data-pct]")) animateNumber(el, Number(el.dataset.pct), (n) => `${Math.round(n)}%`);
    for (const el of main.querySelectorAll<HTMLElement>("[data-n]")) animateNumber(el, Number(el.dataset.n), (n) => String(Math.round(n)));
  }
}

onStateChange(() => void render());
playEnter();
void render();
