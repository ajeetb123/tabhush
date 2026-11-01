// Settings (beta 1 subset): consent (PRIV-60), Domain only (PRIV-03), on-device only (PRIV-70),
// essentials (LOCK-02), and the log of every tier 3 call (PRIV-80). Locked during a session (LOCK-01).

import type { Tier3Request } from "@lockin/core";
import { call, getSnapshot, h, onStateChange, setTitle } from "./common";

setTitle("Settings");
const main = document.querySelector("main")!;

async function tier3Log(): Promise<{ at: number; request: Tier3Request }[]> {
  return new Promise((resolve) => {
    const open = indexedDB.open("lockin");
    open.onsuccess = () => {
      const db = open.result;
      if (!db.objectStoreNames.contains("tier3log")) return resolve([]);
      const req = db.transaction("tier3log").objectStore("tier3log").getAll();
      req.onsuccess = () => resolve(req.result as { at: number; request: Tier3Request }[]);
      req.onerror = () => resolve([]);
    };
    open.onerror = () => resolve([]);
  });
}

async function render(): Promise<void> {
  const { settings, session } = await getSnapshot();
  const locked = session !== null && session.state !== "IDLE" && session.state !== "ENDED";
  const err = h("p", { className: "error", attrs: { role: "alert" } });
  const save = (patch: Parameters<typeof call>[0] & { type: "ui:settings" }) => call(patch).catch((e: Error) => (err.textContent = e.message));

  const toggle = (label: string, checked: boolean, onChange: (v: boolean) => void) => {
    const box = h("input", { type: "checkbox", checked, disabled: locked });
    box.addEventListener("change", () => onChange(box.checked));
    return h("label", { className: "row" }, box, label);
  };

  const consentText = { unknown: "Not asked yet", granted: "AI checks allowed", declined: "Declined (on-device only)" }[settings.consent];
  const allow = h("button", { textContent: "Allow AI checks" });
  const revoke = h("button", { textContent: "Turn AI checks off" });
  allow.addEventListener("click", () => void call({ type: "ui:consent", granted: true }));
  revoke.addEventListener("click", () => void call({ type: "ui:consent", granted: false }));

  const essentials = h("textarea", { rows: 4, value: settings.essentials.join("\n"), disabled: locked, attrs: { "aria-label": "Essentials, one domain per line" } });
  const saveEssentials = h("button", { textContent: "Save essentials", disabled: locked });
  saveEssentials.addEventListener("click", () => {
    const list = essentials.value.split(/\s+/).map((d) => d.trim().toLowerCase()).filter(Boolean);
    void save({ type: "ui:settings", patch: { essentials: list } });
  });

  const log = await tier3Log();
  const logList = h("ul", { className: "plain" });
  for (const entry of [...log].reverse()) {
    logList.append(h("li", {}, h("div", { className: "muted", textContent: new Date(entry.at).toLocaleString() }), h("code", { textContent: JSON.stringify(entry.request) })));
  }

  main.replaceChildren(
    h("h1", { textContent: "Settings" }),
    ...(locked ? [h("p", { className: "muted", textContent: "Settings are locked until the session ends." })] : []),
    h("h2", { textContent: "AI checks" }),
    h("p", { textContent: consentText }),
    h("div", { className: "row" }, allow, revoke),
    toggle("On-device only: never send anything", settings.onDeviceOnly, (v) => void save({ type: "ui:settings", patch: { onDeviceOnly: v } })),
    toggle("Domain only: never send page titles", settings.domainOnly, (v) => void save({ type: "ui:settings", patch: { domainOnly: v } })),
    h("h2", { textContent: "Essentials (never locked)" }),
    essentials,
    h("div", { className: "row" }, saveEssentials),
    err,
    h("h2", { textContent: "Every AI check this install sent" }),
    log.length ? logList : h("p", { className: "muted", textContent: "None yet." }),
  );
}

onStateChange(() => void render());
void render();
