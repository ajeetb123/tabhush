// Settings: essentials (LOCK-02), privacy (PRIV-60/70; nothing is sent while the LLM is off,
// Q-61), always-allowed tools and music (Q-63), incognito status (EXT-11), credits (Q-08).
// Locked during a session (LOCK-01).

import { BRAND, CATEGORY_LIST, LLM, OWNER_RULES, type Tier3Request } from "@lockin/core";
import { call, getSnapshot, h, onStateChange, setTitle, topbar } from "./common";

setTitle("Settings");
const main = document.querySelector("main")!;

async function tier3Log(): Promise<{ at: number; request: Tier3Request }[]> {
  return new Promise((resolve) => {
    const open = indexedDB.open(BRAND.ID);
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

function section(title: string, ...children: (Node | null)[]): Node[] {
  return [h("h2", { textContent: title }), h("div", { className: "card stack" }, ...children.filter((c): c is Node => c !== null))];
}

async function render(): Promise<void> {
  const { settings, session } = await getSnapshot();
  const locked = session !== null && session.state !== "IDLE" && session.state !== "ENDED";
  const err = h("p", { className: "error", attrs: { role: "alert" } });
  const saved = h("p", { className: "muted small", attrs: { role: "status" } });
  const save = (patch: Parameters<typeof call>[0] & { type: "ui:settings" }) =>
    call(patch).then(
      () => (saved.textContent = "Saved."),
      (e: Error) => (err.textContent = e.message),
    );

  const essentials = h("textarea", {
    rows: 4,
    value: settings.essentials.join("\n"),
    disabled: locked,
    placeholder: "notion.so\nfigma.com",
    attrs: { "aria-label": "Essentials, one domain per line" },
  });
  const saveEssentials = h("button", { className: "btn", textContent: "Save", disabled: locked });
  saveEssentials.addEventListener("click", () => {
    const list = essentials.value.split(/\s+/).map((d) => d.trim().toLowerCase()).filter(Boolean);
    void save({ type: "ui:settings", patch: { essentials: list } });
  });

  const incognito = await chrome.extension.isAllowedIncognitoAccess();
  const openExt = h("button", { className: "btn", textContent: "Open extension settings" });
  openExt.addEventListener("click", () => void chrome.tabs.create({ url: `chrome://extensions/?id=${chrome.runtime.id}` }));

  const chips = (items: readonly string[]) => h("div", { className: "chips" }, ...items.map((t) => h("span", { className: "chip static", textContent: t })));

  const nodes: Node[] = [
    topbar(locked ? { text: "Locked in", tone: "live" } : undefined),
    h("h1", { textContent: "Settings" }),
    h("p", { className: "lead", textContent: locked ? "Settings are locked until the session ends." : "Everything here stays on this device." }),
    h("p", {}, h("a", { href: chrome.runtime.getURL("ui/report.html"), textContent: "📊 Open your focus report" })),
    ...section(
      "Essentials",
      h("p", { className: "muted small", textContent: "Sites that are never blocked, one per line. Subdomains are included." }),
      essentials,
      h("div", { className: "spread" }, saved, saveEssentials),
      err,
    ),
    ...section(
      "Always allowed",
      h("p", { className: "muted small", textContent: "Tools that are never blocked." }),
      chips(OWNER_RULES.ALWAYS_ALLOWED_TOOLS),
      h("p", {
        className: "muted small",
        textContent: `Music is always allowed and turned down to ${Math.round(OWNER_RULES.MUSIC_VOLUME * 100)}%: Spotify, YouTube Music, and YouTube videos YouTube labels as music.`,
      }),
    ),
    ...section(
      "Incognito",
      h("p", { textContent: incognito ? "Incognito windows are covered." : "Incognito windows aren’t covered." }),
      incognito ? null : h("p", { className: "muted small", textContent: "Switch on “Allow in Incognito” on the extension page." }),
      incognito ? null : h("div", { className: "row" }, openExt),
    ),
  ];

  if (LLM.ENABLED) {
    const consentText = { unknown: "Not asked yet", granted: "AI checks allowed", declined: "Declined (on-device only)" }[settings.consent];
    const allow = h("button", { className: "btn", textContent: "Allow AI checks" });
    const revoke = h("button", { className: "btn", textContent: "Turn AI checks off" });
    allow.addEventListener("click", () => void call({ type: "ui:consent", granted: true }));
    revoke.addEventListener("click", () => void call({ type: "ui:consent", granted: false }));
    const log = await tier3Log();
    const list = h(
      "ul",
      { className: "items" },
      ...[...log].reverse().map((e) => h("li", {}, h("div", { className: "muted small", textContent: new Date(e.at).toLocaleString() }), h("code", { textContent: JSON.stringify(e.request) }))),
    );
    nodes.push(...section("AI checks", h("p", { textContent: consentText }), h("div", { className: "row" }, allow, revoke), log.length ? list : h("p", { className: "muted small", textContent: "No AI checks sent yet." })));
  } else {
    nodes.push(...section("Privacy", h("p", { textContent: "Every page is judged on this device. No page titles, addresses or task names are ever sent." })));
  }

  nodes.push(
    ...section(
      "Credits",
      h(
        "p",
        { className: "muted small" },
        `Site categories are adapted from the ${CATEGORY_LIST.SOURCE}, licensed ${CATEGORY_LIST.LICENSE}. `,
        h("a", { href: chrome.runtime.getURL("categories/NOTICE.txt"), textContent: "Details" }),
      ),
    ),
  );
  main.replaceChildren(...nodes);
}

onStateChange(() => void render());
void render();
