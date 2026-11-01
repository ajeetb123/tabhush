// Session page. Q-64: one start screen and no prompts. It shows the tasks detected from your tabs
// (toggle, type or say more), a time goal, and what gets blocked (LOOP-04), then "Lock in".
// Also the active view with the goal ring and the summary with the reopen list (LOOP-07).
// The preview cap is TODO_Q17, so every group is shown.

import { BRAND, defaultGoal, goalNote, goalReached, isTodo, MS, OWNER_RULES, SESSION, SWEEP, typicalMinutes } from "@lockin/core";
import type { ActiveSession, PreviewItem } from "../background/session";
import { avatar, blockedCount, call, formatDuration, getSnapshot, goalRing, h, onStateChange, setTitle, stat, topbar } from "./common";
import { listenOnce, onDeviceVoice } from "./voice";

const main = document.querySelector("main")!;
const footer = document.createElement("div");
footer.className = "footer";
document.body.append(footer);

let goal: number | null = null; // chosen on this page; defaults to the user's typical session
let voice: "available" | "downloadable" | null = null;
void onDeviceVoice().then((v) => {
  voice = v;
  void render();
});

function setFooter(...children: (Node | string)[]): void {
  footer.hidden = children.length === 0;
  footer.replaceChildren(h("div", { className: "inner" }, ...children));
}

function hero(pill: Parameters<typeof topbar>[0], title: string, lead?: string): HTMLElement {
  return h("div", { className: "hero" }, topbar(pill), h("h1", { textContent: title }), lead ? h("p", { className: "lead", textContent: lead }) : null);
}

function currentLabels(s: ActiveSession): string[] {
  return s.taskLabel ? s.taskLabel.split(" + ") : [];
}

function tasksCard(s: ActiveSession): HTMLElement {
  const labels = currentLabels(s);
  const setTasks = (next: string[]) => void call({ type: "ui:setTasks", labels: next });
  const on = labels.map((l) => {
    const chip = h("button", { className: "chip on", textContent: `${l}  ×`, attrs: { "aria-label": `Remove ${l}` } });
    chip.addEventListener("click", () => setTasks(labels.filter((x) => x !== l)));
    return chip;
  });
  const off = s.suggestions
    .filter((g) => !labels.includes(g.label))
    .map((g) => {
      const chip = h("button", { className: "chip", textContent: `+ ${g.label}`, attrs: { "aria-label": `Add ${g.label}` } });
      chip.addEventListener("click", () => setTasks([...labels, g.label]));
      return chip;
    });

  const input = h("input", { type: "text", placeholder: labels.length ? "Add another task" : "What are you working on?", attrs: { "aria-label": "Add a task" } });
  const add = () => input.value.trim() && setTasks([...labels, input.value.trim()]);
  input.addEventListener("keydown", (e) => e.key === "Enter" && add());
  const row = h("div", { className: "row" }, input);
  if (voice) {
    const mic = h("button", { className: "btn mic", attrs: { "aria-label": "Say a task", "aria-pressed": "false" } });
    mic.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>';
    mic.addEventListener("click", () => {
      mic.setAttribute("aria-pressed", "true");
      void listenOnce().then((said) => {
        mic.setAttribute("aria-pressed", "false");
        if (said) setTasks([...labels, said]);
      });
    });
    row.append(mic);
  }
  input.style.flex = "1";
  return h(
    "div",
    { className: "card stack" },
    on.length || off.length ? h("div", { className: "chips" }, ...on, ...off) : null,
    row,
    voice ? null : h("p", { className: "muted small", textContent: "Tip: separate tasks you juggle, like “CS 2114” and “Internship apps”." }),
  );
}

function goalCard(typical: number | null): HTMLElement {
  goal ??= defaultGoal(typical);
  const presets = OWNER_RULES.GOAL_PRESETS_MIN.map((m) => {
    const b = h("button", { className: "chip", textContent: `${m} min`, attrs: { "aria-pressed": String(goal === m) } });
    b.addEventListener("click", () => {
      goal = m;
      void render();
    });
    return b;
  });
  const custom = h("input", {
    type: "number",
    min: String(OWNER_RULES.GOAL_MIN_MIN),
    max: String(SESSION.MAX_LENGTH_MIN),
    value: (OWNER_RULES.GOAL_PRESETS_MIN as readonly number[]).includes(goal) ? "" : String(goal),
    placeholder: "Custom",
    attrs: { "aria-label": "Custom minutes" },
  });
  custom.style.width = "110px";
  custom.className = "chip";
  custom.addEventListener("change", () => {
    const v = Number(custom.value);
    if (v > 0) {
      goal = Math.min(SESSION.MAX_LENGTH_MIN, Math.max(OWNER_RULES.GOAL_MIN_MIN, Math.round(v)));
      void render();
    }
  });
  const note = goalNote(goal, typical);
  return h(
    "div",
    { className: "card stack" },
    h("div", { className: "chips" }, ...presets, custom),
    typical !== null ? h("p", { className: "muted small", textContent: `Your usual: about ${typical} min.` }) : null,
    note ? h("p", { className: "note", textContent: note }) : null,
  );
}

function groupByDomain(items: PreviewItem[]): [string, PreviewItem[]][] {
  const groups = new Map<string, PreviewItem[]>();
  for (const i of items) groups.set(i.domain, [...(groups.get(i.domain) ?? []), i]);
  const sorted = [...groups.entries()].sort((a, b) => b[1].length - a[1].length);
  return isTodo(SWEEP.PREVIEW_MAX_GROUPS) ? sorted : sorted.slice(0, SWEEP.PREVIEW_MAX_GROUPS);
}

function blockList(s: ActiveSession): Node[] {
  const out: Node[] = [];
  if (!s.preview.length) {
    out.push(h("div", { className: "card empty", textContent: s.taskIds.length ? "Nothing to block. Every open tab fits." : "Add a task to see what gets blocked." }));
    return out;
  }
  for (const [domain, items] of groupByDomain(s.preview)) {
    const list = h("ul", { className: "items" });
    for (const item of items) {
      const box = h("input", { type: "checkbox", checked: item.park, attrs: { "aria-label": `Block ${item.title || item.url}` } });
      box.addEventListener("change", () => void call({ type: "ui:toggle", tabId: item.tabId, park: box.checked }));
      list.append(h("li", {}, h("label", {}, box, h("span", { className: "title", textContent: item.title || item.url }))));
    }
    out.push(
      h(
        "div",
        { className: "card" },
        h("div", { className: "site" }, avatar(domain), h("div", {}, h("div", { textContent: domain }), h("div", { className: "muted small", textContent: `${items.length} tab${items.length === 1 ? "" : "s"}` }))),
        list,
      ),
    );
  }
  return out;
}

function startView(s: ActiveSession, history: number[]): Node[] {
  setTitle("Lock in");
  const typical = typicalMinutes(history);
  const toBlock = s.preview.filter((p) => p.park).length;
  const lockIn = h("button", { className: "btn primary", textContent: `Lock in for ${goal ?? defaultGoal(typical)} min`, disabled: s.taskIds.length === 0 });
  lockIn.addEventListener("click", () => void call({ type: "ui:confirm", goalMin: goal ?? defaultGoal(typical) }));
  const nodes: Node[] = [
    hero({ text: "Ready" }, "Let’s lock in", s.taskIds.length ? "Here’s what your tabs say you’re working on." : "Tell it what you’re working on."),
    h("h2", { textContent: "Working on" }),
    tasksCard(s),
    h("h2", { textContent: "For how long" }),
    goalCard(typical),
    ...s.suspensions.map((x) => h("p", { className: "muted small", textContent: x })),
    h("h2", { textContent: `Getting blocked · ${toBlock}` }),
    ...blockList(s),
  ];
  // The goal label on the button follows the picker.
  setFooter(h("span", { className: "muted small", textContent: "Blocks stay until you finish. Untick anything you need." }), lockIn);
  return nodes;
}

let tick: number | undefined;

function activeView(s: ActiveSession): Node[] {
  setTitle(s.taskLabel ?? "");
  const ring = goalRing();
  const stopBtn = h("button", { className: "btn primary", textContent: "Stop, I’m done" });
  stopBtn.addEventListener("click", () => void call({ type: "ui:stop" }));
  const breakTotal = () => (s.breaks ?? []).reduce((sum, b) => sum + ((b.endedAt ?? Date.now()) - b.startedAt), 0);
  const update = () => {
    const elapsed = Date.now() - (s.committedAt ?? s.startedAt) - breakTotal();
    const reached = goalReached(s.committedAt, s.goalMin, Date.now(), breakTotal());
    ring.update(elapsed, s.goalMin, reached ? "goal reached" : s.goalMin ? `of ${s.goalMin} min` : "");
    setFooter(...(reached ? [h("span", { className: "muted small", textContent: "You hit your goal. Keep going or stop now." }), stopBtn] : []));
  };
  update();
  tick = window.setInterval(update, MS.SECOND);
  return [
    s.state === "ON_BREAK"
      ? hero({ text: "On a break" }, "Take a breather", "Everything’s unlocked for now. It locks again on its own.")
      : hero(s.state === "END_COUNTDOWN" ? { text: "Ending", tone: "warn" } : { text: "Locked in", tone: "live" }, "You’re locked in", s.taskLabel ?? undefined),
    h("div", { className: "card" }, ring.el),
    h("div", { className: "stats" }, stat(String(blockedCount(s)), "blocked so far")),
    h("p", { className: "muted small", textContent: `Before your goal, End lives in the ${BRAND.NAME} button in your toolbar.` }),
  ];
}

function endedView(s: ActiveSession): Node[] {
  setTitle("Session summary");
  const again = h("button", { className: "btn primary", textContent: "Start a new session" });
  again.addEventListener("click", () => void call({ type: "ui:start" }));
  const done = h("button", { className: "btn", textContent: "Done" });
  done.addEventListener("click", () => void call({ type: "ui:dismiss" }).then(() => window.close()));
  const report = h("button", { className: "btn", textContent: "See your day" });
  report.addEventListener("click", () => void call({ type: "ui:dismiss" }).then(() => location.replace(chrome.runtime.getURL("ui/report.html"))));
  setFooter(h("div", { className: "row" }, report, done), again);
  const duration = (s.endedAt ?? Date.now()) - (s.committedAt ?? s.startedAt);
  const won = s.endKind === "normal";
  const out: Node[] = [
    hero({ text: won ? "Goal reached" : "Ended early" }, won ? "Session complete" : "Session over", s.taskLabel ?? undefined),
    h("div", { className: "stats" }, stat(formatDuration(duration), "locked in"), stat(s.goalMin ? `${s.goalMin} min` : "–", "goal"), stat(String(blockedCount(s)), "blocked")),
  ];
  const byDomain = new Map<string, number>();
  for (const e of s.blockEvents ?? []) if (e.domain) byDomain.set(e.domain, (byDomain.get(e.domain) ?? 0) + 1);
  if (byDomain.size) {
    out.push(h("h2", { textContent: "What got blocked" }));
    const list = h("ul", { className: "items" });
    for (const [d, n] of [...byDomain.entries()].sort((a, b) => b[1] - a[1])) {
      list.append(h("li", { className: "spread" }, h("div", { className: "site" }, avatar(d), h("span", { textContent: d })), h("span", { className: "muted", textContent: `${n}×` })));
    }
    out.push(h("div", { className: "card" }, list));
  }
  for (const sus of s.suspensions) out.push(h("p", { className: "muted small", textContent: sus }));
  if (s.restoreList.length) {
    out.push(h("h2", { textContent: "Reopen" }));
    const list = h("ul", { className: "items" });
    for (const r of s.restoreList) {
      const open = h("button", { className: "btn", textContent: "Reopen" });
      open.addEventListener("click", () => void chrome.tabs.create({ url: r.url }));
      list.append(h("li", { className: "spread" }, h("span", { className: "title", textContent: r.title }), open));
    }
    out.push(h("div", { className: "card" }, list));
  }
  return out;
}

async function render(): Promise<void> {
  window.clearInterval(tick);
  const { session: s, history } = await getSnapshot();
  let nodes: Node[];
  if (!s || s.state === "IDLE") {
    setFooter();
    nodes = [hero(undefined, "No session running", `Press Start in the ${BRAND.NAME} toolbar button.`)];
  } else if (s.state === "INFERRING") {
    setFooter();
    nodes = [hero({ text: "Starting" }, "Reading your tabs…", "Working out what you’re focused on.")];
  } else if (s.state === "SWEEP_PREVIEW") nodes = startView(s, history);
  else if (s.state === "ENDED") nodes = endedView(s);
  else nodes = activeView(s);
  const focused = document.activeElement?.getAttribute("aria-label");
  main.replaceChildren(...nodes);
  if (focused) main.querySelector<HTMLElement>(`[aria-label="${CSS.escape(focused)}"]`)?.focus();
}

onStateChange(() => void render());
void render();
