// Session page: clarify prompt (LOOP-03), task chip and rename (LOOP-02), "Same as X?" (CLS-31),
// sweep preview grouped by domain with Confirm (LOOP-04), and the basic End view with the
// restore list (LOOP-07). The preview cap is TODO_Q17, so every group is shown for now.

import { isTodo, SWEEP } from "@lockin/core";
import type { ActiveSession, PreviewItem } from "../background/session";
import { call, getSnapshot, h, onStateChange, setTitle } from "./common";

const main = document.querySelector("main")!;

function clarifyView(s: ActiveSession): Node[] {
  setTitle("What’s this session for?");
  const out: Node[] = [h("h1", { textContent: "What’s this session for?" })];
  if (s.sameAs) return [...out, sameAsView(s)];
  const guesses = h("div", { className: "row" });
  for (const g of s.clarify?.guesses ?? []) {
    const b = h("button", { textContent: g.label });
    b.addEventListener("click", () => void call({ type: "ui:clarify", label: g.label }));
    guesses.append(b);
  }
  const input = h("input", { type: "text", placeholder: "e.g. Lab report", attrs: { "aria-label": "Task" } });
  const go = h("button", { className: "primary", textContent: "Continue" });
  const submit = () => input.value.trim() && void call({ type: "ui:clarify", label: input.value });
  go.addEventListener("click", submit);
  input.addEventListener("keydown", (e) => e.key === "Enter" && submit());
  out.push(guesses, input, h("div", { className: "row" }, go));
  queueMicrotask(() => input.focus());
  return out;
}

function sameAsView(s: ActiveSession): Node {
  const box = h("div", { className: "group", attrs: { role: "group", "aria-label": "Same task?" } });
  for (const c of s.sameAs!.candidates) {
    const yes = h("button", { className: "primary", textContent: `Same as ${c.label}` });
    yes.addEventListener("click", () => void call({ type: "ui:sameAs", taskId: c.taskId }));
    box.append(h("div", { className: "row" }, yes));
  }
  const no = h("button", { textContent: `No, “${s.sameAs!.label}” is new` });
  no.addEventListener("click", () => void call({ type: "ui:sameAs", taskId: null }));
  box.append(h("div", { className: "row" }, no));
  return box;
}

function groupByDomain(items: PreviewItem[]): [string, PreviewItem[]][] {
  const groups = new Map<string, PreviewItem[]>();
  for (const i of items) groups.set(i.domain, [...(groups.get(i.domain) ?? []), i]);
  const sorted = [...groups.entries()].sort((a, b) => b[1].length - a[1].length);
  return isTodo(SWEEP.PREVIEW_MAX_GROUPS) ? sorted : sorted.slice(0, SWEEP.PREVIEW_MAX_GROUPS);
}

function previewView(s: ActiveSession): Node[] {
  setTitle("Sweep preview");
  const out: Node[] = [];
  if (s.sameAs) return [h("h1", { textContent: "Same task?" }), sameAsView(s)];

  const chip = h("input", { type: "text", value: s.chip?.label ?? "", attrs: { "aria-label": "Task (rename if wrong)" } });
  const save = h("button", { textContent: "Rename" });
  save.addEventListener("click", () => void call({ type: "ui:rename", label: chip.value }));
  out.push(h("h1", { textContent: "Lock in on" }), h("div", { className: "row" }, chip, save));

  for (const sus of s.suspensions) out.push(h("p", { className: "muted", textContent: sus }));

  out.push(h("h2", { textContent: s.preview.length ? `Park ${s.preview.filter((p) => p.park).length} unrelated tabs` : "Nothing to park" }));
  for (const [domain, items] of groupByDomain(s.preview)) {
    const list = h("ul", { className: "plain" });
    for (const item of items) {
      const box = h("input", { type: "checkbox", checked: item.park, attrs: { "aria-label": `Park ${item.title || item.url}` } });
      box.addEventListener("change", () => void call({ type: "ui:toggle", tabId: item.tabId, park: box.checked }));
      list.append(h("li", {}, h("label", { className: "row" }, box, item.title || item.url)));
    }
    out.push(h("details", { className: "group", open: items.length <= 3 }, h("summary", { textContent: `${domain} · ${items.length}` }), list));
  }

  for (const c of s.separate) {
    const park = h("button", { textContent: "Park all", attrs: { "aria-pressed": String(c.park === true) } });
    const keep = h("button", { textContent: "Keep open", attrs: { "aria-pressed": String(c.park === false) } });
    park.addEventListener("click", () => void call({ type: "ui:separate", contextId: c.id, park: true }));
    keep.addEventListener("click", () => void call({ type: "ui:separate", contextId: c.id, park: false }));
    out.push(h("div", { className: "group" }, h("p", { textContent: `${c.title}: part of this session?` }), h("div", { className: "row" }, park, keep)));
  }

  const confirm = h("button", { className: "primary", textContent: "Confirm", disabled: s.separate.some((c) => c.park === null) });
  confirm.addEventListener("click", () => void call({ type: "ui:confirm" }));
  out.push(h("div", { className: "row" }, confirm), h("p", { className: "muted", textContent: "You can undo for 30 seconds after confirming." }));
  return out;
}

function activeView(s: ActiveSession): Node[] {
  setTitle(s.taskLabel ?? "");
  return [
    h("h1", { textContent: s.taskLabel ?? "" }),
    h("p", { textContent: s.state === "END_COUNTDOWN" ? "Ending soon. Locks stay on until the countdown finishes." : "Locked in. End or undo from the toolbar button." }),
  ];
}

function endedView(s: ActiveSession): Node[] {
  setTitle("Session ended");
  const out: Node[] = [h("h1", { textContent: s.taskLabel ?? "Session ended" }), h("p", { className: "muted", textContent: s.endKind === "early" ? "Ended early." : "Ended." })];
  for (const sus of s.suspensions) out.push(h("p", { className: "muted", textContent: sus }));
  if (s.restoreList.length) {
    out.push(h("h2", { textContent: "Restore" }));
    const list = h("ul", { className: "plain" });
    for (const r of s.restoreList) {
      const open = h("button", { textContent: "Reopen" });
      open.addEventListener("click", () => void chrome.tabs.create({ url: r.url }));
      list.append(h("li", { className: "row" }, open, `${r.title} (${r.reason})`));
    }
    out.push(list);
  }
  const done = h("button", { className: "primary", textContent: "Done" });
  done.addEventListener("click", () => void call({ type: "ui:dismiss" }).then(() => window.close()));
  out.push(h("div", { className: "row" }, done));
  return out;
}

async function render(): Promise<void> {
  const { session: s } = await getSnapshot();
  let nodes: Node[];
  if (!s || s.state === "IDLE") nodes = [h("p", { textContent: "No session. Press Start in the toolbar." })];
  else if (s.state === "INFERRING") nodes = [h("p", { attrs: { role: "status" }, textContent: "Figuring out the task…" })];
  else if (s.state === "CLARIFY") nodes = clarifyView(s);
  else if (s.state === "SWEEP_PREVIEW") nodes = previewView(s);
  else if (s.state === "ENDED") nodes = endedView(s);
  else nodes = activeView(s);
  const focused = document.activeElement?.getAttribute("aria-label");
  main.replaceChildren(...nodes);
  if (focused) main.querySelector<HTMLElement>(`[aria-label="${CSS.escape(focused)}"]`)?.focus();
}

onStateChange(() => void render());
void render();
