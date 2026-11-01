// Session page: clarify prompt with one or several tasks (LOOP-03, Q-63), task chip and rename
// (LOOP-02), "Same as X?" (CLS-31), sweep preview grouped by domain with Confirm (LOOP-04), the
// active view, and the summary with the restore list (LOOP-07). The preview cap is TODO_Q17, so
// every group is shown. Owner rule (Q-63): blocks can't be undone, so the preview says so.

import { isTodo, MS, SWEEP } from "@lockin/core";
import type { ActiveSession, PreviewItem } from "../background/session";
import { avatar, blockedCount, call, formatDuration, getSnapshot, h, onStateChange, setTitle, stat, topbar } from "./common";

const main = document.querySelector("main")!;
const footer = document.createElement("div");
footer.className = "footer";
document.body.append(footer);

// Local picks in the clarify prompt survive re-renders until Continue.
const picked = new Set<string>();
const typed: string[] = [""];
let clarifySeeded = false;

function setFooter(...children: (Node | string)[]): void {
  footer.hidden = children.length === 0;
  footer.replaceChildren(h("div", { className: "inner" }, ...children));
}

function clarifyView(s: ActiveSession): Node[] {
  setTitle("What’s this session for?");
  if (s.sameAs) return [topbar({ text: "Starting" }), h("h1", { textContent: "Same task?" }), sameAsView(s)];
  if (!clarifySeeded) {
    for (const id of s.clarify?.preselected ?? []) picked.add(id);
    clarifySeeded = true;
  }
  const guesses = s.clarify?.guesses ?? [];
  const chips = h(
    "div",
    { className: "chips" },
    ...guesses.map((g) => {
      const chip = h("button", { className: "chip", textContent: g.label, attrs: { "aria-pressed": String(picked.has(g.taskId)) } });
      chip.addEventListener("click", () => {
        if (picked.has(g.taskId)) picked.delete(g.taskId);
        else picked.add(g.taskId);
        void render();
      });
      return chip;
    }),
  );

  const inputs = typed.map((value, i) => {
    const input = h("input", { type: "text", value, placeholder: i === 0 ? "e.g. Lab report chemistry" : "Another task", attrs: { "aria-label": `Task ${i + 1}` } });
    input.addEventListener("input", () => {
      typed[i] = input.value;
      continueBtn.disabled = labels().length === 0;
    });
    input.addEventListener("keydown", (e) => e.key === "Enter" && submit());
    return input;
  });
  const add = h("button", { className: "btn", textContent: "+ Add another task" });
  add.addEventListener("click", () => {
    typed.push("");
    void render().then(() => main.querySelector<HTMLInputElement>(`[aria-label="Task ${typed.length}"]`)?.focus());
  });

  const labels = () => [...guesses.filter((g) => picked.has(g.taskId)).map((g) => g.label), ...typed.map((t) => t.trim()).filter(Boolean)];
  const submit = () => {
    const l = labels();
    if (l.length) void call({ type: "ui:clarify", labels: l });
  };
  const continueBtn = h("button", { className: "btn primary", textContent: "Continue", disabled: labels().length === 0 });
  continueBtn.addEventListener("click", submit);
  setFooter(h("span", { className: "muted small", textContent: "Pick everything you’re working on. Pages for any of them stay open." }), continueBtn);

  const multi = (s.clarify?.preselected.length ?? 0) >= 2;
  return [
    topbar({ text: "Starting" }),
    h("h1", { textContent: multi ? "Looks like a few things are open" : "What’s this session for?" }),
    h("p", { className: "lead", textContent: multi ? "Your tabs fit more than one task. Keep the ones you’re working on now." : "Pick one or more, or type your own." }),
    guesses.length ? h("div", { className: "card" }, chips) : null,
    h("div", { className: "card stack" }, ...inputs, h("div", { className: "row" }, add)),
  ].filter((n): n is HTMLElement => n !== null);
}

function sameAsView(s: ActiveSession): Node {
  const box = h("div", { className: "card stack", attrs: { role: "group", "aria-label": "Same task?" } });
  box.append(h("p", { className: "muted", textContent: `“${s.sameAs!.label}” looks like a task you’ve done before.` }));
  for (const c of s.sameAs!.candidates) {
    const yes = h("button", { className: "btn primary", textContent: `Same as ${c.label}` });
    yes.addEventListener("click", () => void call({ type: "ui:sameAs", taskId: c.taskId }));
    box.append(h("div", { className: "row" }, yes));
  }
  const no = h("button", { className: "btn", textContent: `No, “${s.sameAs!.label}” is new` });
  no.addEventListener("click", () => void call({ type: "ui:sameAs", taskId: null }));
  box.append(h("div", { className: "row" }, no));
  setFooter();
  return box;
}

function groupByDomain(items: PreviewItem[]): [string, PreviewItem[]][] {
  const groups = new Map<string, PreviewItem[]>();
  for (const i of items) groups.set(i.domain, [...(groups.get(i.domain) ?? []), i]);
  const sorted = [...groups.entries()].sort((a, b) => b[1].length - a[1].length);
  return isTodo(SWEEP.PREVIEW_MAX_GROUPS) ? sorted : sorted.slice(0, SWEEP.PREVIEW_MAX_GROUPS);
}

function taskChips(s: ActiveSession): HTMLElement {
  return h("div", { className: "chips" }, ...(s.taskLabel ?? "").split(" + ").map((t) => h("span", { className: "chip static on", textContent: t })));
}

function previewView(s: ActiveSession): Node[] {
  setTitle("Review what gets blocked");
  if (s.sameAs) return [topbar({ text: "Starting" }), h("h1", { textContent: "Same task?" }), sameAsView(s)];
  const out: Node[] = [topbar({ text: "Starting" }), h("h1", { textContent: "Lock in on" }), taskChips(s)];

  if (s.taskIds.length <= 1) {
    const chip = h("input", { type: "text", value: s.chip?.label ?? "", attrs: { "aria-label": "Task name" } });
    const save = h("button", { className: "btn", textContent: "Rename" });
    save.addEventListener("click", () => void call({ type: "ui:rename", label: chip.value }));
    out.push(h("details", { className: "card" }, h("summary", { className: "muted small", textContent: "Wrong task? Rename it" }), h("div", { className: "row", attrs: { style: "margin-top:10px" } }, chip, save)));
  }
  for (const sus of s.suspensions) out.push(h("p", { className: "muted small", textContent: sus }));

  const toBlock = s.preview.filter((p) => p.park).length;
  out.push(h("h2", { textContent: s.preview.length ? `Will be blocked · ${toBlock}` : "Will be blocked" }));
  if (!s.preview.length) out.push(h("div", { className: "card empty", textContent: "Nothing to block. Everything open fits the task." }));
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

  if (s.separate.length) out.push(h("h2", { textContent: "Other windows and tab groups" }));
  for (const c of s.separate) {
    const park = h("button", { textContent: "Block all", attrs: { "aria-pressed": String(c.park === true) } });
    const keep = h("button", { textContent: "Keep open", attrs: { "aria-pressed": String(c.park === false) } });
    park.addEventListener("click", () => void call({ type: "ui:separate", contextId: c.id, park: true }));
    keep.addEventListener("click", () => void call({ type: "ui:separate", contextId: c.id, park: false }));
    out.push(h("div", { className: "card spread" }, h("div", {}, h("div", { textContent: c.title }), h("div", { className: "muted small", textContent: "Part of this session?" })), h("div", { className: "seg" }, park, keep)));
  }

  const waiting = s.separate.filter((c) => c.park === null).length;
  const confirm = h("button", { className: "btn primary", textContent: "Lock in", disabled: waiting > 0 });
  confirm.addEventListener("click", () => void call({ type: "ui:confirm" }));
  setFooter(
    h("span", { className: "muted small", textContent: waiting ? `Answer ${waiting} more above to continue.` : "Blocks can’t be undone until the session ends. Untick anything you want to keep." }),
    confirm,
  );
  return out;
}

let tick: number | undefined;

function activeView(s: ActiveSession): Node[] {
  setTitle(s.taskLabel ?? "");
  setFooter();
  const clock = h("div", { className: "timer", attrs: { role: "timer" } });
  const update = () => (clock.textContent = formatDuration(Date.now() - (s.committedAt ?? s.startedAt)));
  update();
  tick = window.setInterval(update, MS.SECOND);
  return [
    topbar(s.state === "END_COUNTDOWN" ? { text: "Ending", tone: "warn" } : { text: "Locked in", tone: "live" }),
    h("h1", { textContent: "You’re locked in" }),
    taskChips(s),
    h("div", { className: "card" }, h("div", { className: "muted small", textContent: "Focused for" }), clock),
    h("div", { className: "stats" }, stat(String(blockedCount(s)), "blocked so far")),
    h("p", { className: "muted small", textContent: "End the session from the Lock-in button in your toolbar." }),
  ];
}

function endedView(s: ActiveSession): Node[] {
  setTitle("Session summary");
  const done = h("button", { className: "btn primary", textContent: "Done" });
  done.addEventListener("click", () => void call({ type: "ui:dismiss" }).then(() => window.close()));
  setFooter(h("span"), done);
  const duration = (s.endedAt ?? Date.now()) - (s.committedAt ?? s.startedAt);
  const out: Node[] = [
    topbar({ text: s.endKind === "early" ? "Ended early" : "Complete" }),
    h("h1", { textContent: "Session summary" }),
    taskChips(s),
    h("div", { className: "stats" }, stat(formatDuration(duration), "session length"), stat(String(blockedCount(s)), "blocked")),
  ];
  for (const sus of s.suspensions) out.push(h("p", { className: "muted small", textContent: sus }));
  if (s.restoreList.length) {
    out.push(h("h2", { textContent: "Reopen" }));
    const list = h("div", { className: "card" }, h("ul", { className: "items" }));
    for (const r of s.restoreList) {
      const open = h("button", { className: "btn", textContent: "Reopen" });
      open.addEventListener("click", () => void chrome.tabs.create({ url: r.url }));
      list.firstElementChild!.append(h("li", { className: "spread" }, h("span", { className: "title", textContent: r.title }), open));
    }
    out.push(list);
  }
  return out;
}

async function render(): Promise<void> {
  window.clearInterval(tick);
  const { session: s } = await getSnapshot();
  let nodes: Node[];
  if (!s || s.state === "IDLE") {
    setFooter();
    nodes = [topbar(), h("div", { className: "card empty", textContent: "No session running. Press Start in the Lock-in toolbar button." })];
  } else if (s.state === "INFERRING") {
    setFooter();
    nodes = [topbar({ text: "Starting" }), h("h1", { textContent: "Reading your tabs…" }), h("p", { className: "lead", attrs: { role: "status" }, textContent: "Working out what you’re focused on." })];
  } else if (s.state === "CLARIFY") nodes = clarifyView(s);
  else if (s.state === "SWEEP_PREVIEW") nodes = previewView(s);
  else if (s.state === "ENDED") nodes = endedView(s);
  else nodes = activeView(s);
  const focused = document.activeElement?.getAttribute("aria-label");
  main.replaceChildren(...nodes);
  if (focused) main.querySelector<HTMLElement>(`[aria-label="${CSS.escape(focused)}"]`)?.focus();
}

onStateChange(() => void render());
void render();
