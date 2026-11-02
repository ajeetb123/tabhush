// The full report of one session (Q-69): where the time went, site by site and page by page,
// and the session in order. Used by the session summary and the report's Sessions tab.

import { MS } from "@lockin/core";
import { avatar, h, stat } from "./common";
import { focusSplit, formatHm, offClockMs, productiveParts, sessionTimeline, siteBreakdown, type SessionLike } from "./reportData";

const PAGES_SHOWN = 6;
const TIMELINE_MIN_MS = 30 * MS.SECOND; // shorter stretches are noise in the timeline
const TIMELINE_MAX = 60;

const clock = (t: number) => new Date(t).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

export function endLabel(s: SessionLike): string {
  if (s.endedAt === null) return "now";
  if (s.endKind === "normal") return "goal reached";
  if (s.endKind === "emergency") return "emergency stop";
  if (s.endKind === "idle") return "ended while away";
  return "ended early";
}

export function sessionDetail(s: SessionLike, now = Date.now()): HTMLElement {
  const split = focusSplit(s, now);
  const sites = siteBreakdown(s, now);
  const wrap = h("div", { className: "stack detail" });

  wrap.append(
    h(
      "div",
      { className: "stats" },
      stat(formatHm(split.on), "on task"),
      ...(split.other > 0 ? [stat(formatHm(split.other), "other work")] : []),
      stat(formatHm(split.off), "off task"),
      stat(formatHm(split.away), "away"),
      stat(String(s.blockEvents.length), "blocked"),
    ),
  );
  const off = offClockMs(s, now);
  const notes: string[] = [];
  if ((s.breaks ?? []).length) notes.push(`${s.breaks!.length} break${s.breaks!.length === 1 ? "" : "s"}`);
  if ((s.pauses ?? []).length) notes.push(`stepped away ${s.pauses!.length}×`);
  if (off > 0) notes.push(`${formatHm(off)} off the clock`);
  if (notes.length) wrap.append(h("p", { className: "muted small", textContent: `${notes.join(" · ")}. Away time is outside the browser, idle, on a break or stepped away.` }));
  if (s.endKind === "emergency") wrap.append(h("p", { className: "note warn", textContent: `Emergency stop${s.emergencyReason ? `: “${s.emergencyReason}”` : ""}` }));

  // Q-72: productive work for other tasks during this session.
  const side = productiveParts(s, now).filter((p) => p.side);
  if (side.length) {
    wrap.append(h("h2", { textContent: "Other productive work" }));
    const list = h("ul", { className: "items" });
    for (const p of side.sort((a, b) => b.ms - a.ms)) {
      list.append(h("li", { className: "spread" }, h("div", { className: "site" }, h("span", { className: "dot", attrs: { style: `background:${p.color}` } }), h("span", { textContent: p.label })), h("b", { textContent: formatHm(p.ms) })));
    }
    wrap.append(h("div", { className: "card" }, list), h("p", { className: "muted small", textContent: "Counted as focused time, under those tasks in your day." }));
  }

  wrap.append(h("h2", { textContent: "Where your time went" }));
  if (sites.length === 0) {
    wrap.append(h("p", { className: "muted small", textContent: "Nothing recorded for this session." }));
  } else {
    const max = sites[0]!.ms;
    const list = h("ul", { className: "items sites" });
    for (const site of sites) {
      const bar = h("div", { className: `bar ${site.kind}` }, h("span", { attrs: { style: `width:${Math.max(3, Math.round((site.ms / max) * 100))}%` } }));
      const head = h(
        "div",
        { className: "spread" },
        h("div", { className: "site" }, avatar(site.domain), h("span", { textContent: site.domain }), site.kind === "off" ? h("span", { className: "tag", textContent: "off task" }) : site.kind === "other" ? h("span", { className: "tag other", textContent: site.task ?? "other work" }) : null),
        h("b", { textContent: formatHm(site.ms) }),
      );
      const li = h("li", { className: "stack tight" }, head, bar);
      if (site.pages.length) {
        const pages = h("ul", { className: "pages" });
        for (const p of site.pages.slice(0, PAGES_SHOWN)) pages.append(h("li", { className: "spread" }, h("span", { className: "title", textContent: p.title }), h("span", { className: "muted", textContent: formatHm(p.ms) })));
        if (site.pages.length > PAGES_SHOWN) pages.append(h("li", { className: "muted small", textContent: `and ${site.pages.length - PAGES_SHOWN} more` }));
        li.append(pages);
      }
      list.append(li);
    }
    wrap.append(h("div", { className: "card" }, list));
  }

  const timeline = sessionTimeline(s, now).filter((t) => t.to - t.from >= TIMELINE_MIN_MS);
  if (timeline.length) {
    wrap.append(h("h2", { textContent: "Timeline" }));
    const list = h("ol", { className: "timeline" });
    for (const t of timeline.slice(0, TIMELINE_MAX)) {
      const base = t.state === "away" ? "Away" : t.title ? `${t.domain ?? ""} · ${t.title}` : (t.domain ?? "Browser");
      const what = t.state === "other" && t.task ? `${base}  (${t.task})` : base;
      list.append(
        h(
          "li",
          { className: `tl ${t.state}` },
          h("span", { className: "when", textContent: `${clock(t.from)}–${clock(t.to)}` }),
          h("span", { className: "what title", textContent: what }),
          h("span", { className: "muted", textContent: formatHm(t.to - t.from) }),
        ),
      );
    }
    if (timeline.length > TIMELINE_MAX) list.append(h("li", { className: "muted small", textContent: `and ${timeline.length - TIMELINE_MAX} more` }));
    wrap.append(h("div", { className: "card" }, list));
  }
  return wrap;
}
