// Settings (and the first-run setup, EXT-12 on desktop): permissions, school sites, essentials
// (LOCK-02), tracking and login (Q-70), what's always allowed (Q-63), credits (Q-08).
// Locked during a session (LOCK-01).

import { BRAND, CATEGORY_LIST, DESKTOP, OWNER_RULES } from "@lockin/core";
import type { Settings } from "../shared/types";
import { call, domainsFrom, getSnapshot, h, onStateChange, setTitle, topbar } from "./common";

setTitle("Settings");
const main = document.querySelector("main")!;

function section(title: string, ...children: (Node | null)[]): Node[] {
  return [h("h2", { textContent: title }), h("div", { className: "card stack" }, ...children.filter((c): c is Node => c !== null))];
}

async function render(): Promise<void> {
  const { settings, session, permissions, platform, helperError } = await getSnapshot();
  const isWin = platform === "win32";
  const locked = session !== null && session.state !== "IDLE" && session.state !== "ENDED";
  const err = h("p", { className: "error", attrs: { role: "alert" } });
  const saved = h("p", { className: "muted small", attrs: { role: "status" } });
  const save = (patch: { type: "settings"; patch: Partial<Settings> }) =>
    call(patch).then(
      () => (saved.textContent = "Saved."),
      (e: Error) => (err.textContent = e.message),
    );

  const schoolSites = h("textarea", {
    rows: 3,
    value: settings.schoolSites.join("\n"),
    disabled: locked,
    placeholder: "canvas.vt.edu\nprairielearn.endeavour.cs.vt.edu",
    attrs: { "aria-label": "School sites, one per line" },
  });
  const saveSchool = h("button", { className: "btn", textContent: "Save", disabled: locked });
  saveSchool.addEventListener("click", () => void save({ type: "settings", patch: { schoolSites: domainsFrom(schoolSites.value) } }));

  const essentials = h("textarea", {
    rows: 4,
    value: settings.essentials.join("\n"),
    disabled: locked,
    placeholder: "notion.so\nfigma.com",
    attrs: { "aria-label": "Essentials, one domain per line" },
  });
  const saveEssentials = h("button", { className: "btn", textContent: "Save", disabled: locked });
  saveEssentials.addEventListener("click", () => {
    void save({ type: "settings", patch: { essentials: domainsFrom(essentials.value) } });
  });

  const allowAx = h("button", { className: "btn primary", textContent: "Allow Accessibility" });
  allowAx.addEventListener("click", () => void call({ type: "requestAccessibility" }).then(() => call({ type: "openPrivacyPane", pane: "accessibility" })));
  const openAuto = h("button", { className: "btn", textContent: "Open Automation settings" });
  openAuto.addEventListener("click", () => void call({ type: "openPrivacyPane", pane: "automation" }));

  const toggle = (label: string, key: "trackAllDay" | "openAtLogin", hint: string) => {
    const box = h("input", { type: "checkbox", checked: settings[key], disabled: locked });
    box.addEventListener("change", () => void save({ type: "settings", patch: { [key]: box.checked } }));
    return h("div", { className: "stack tight" }, h("label", { className: "row" }, box, h("span", { textContent: label })), h("p", { className: "muted small", textContent: hint }));
  };

  const finish = h("button", { className: "btn primary block", textContent: "Done, take me to Start" });
  finish.addEventListener("click", () => void call({ type: "settings", patch: { onboarded: true } }).then(() => location.replace("session.html")));

  const chips = (items: readonly string[]) => h("div", { className: "chips" }, ...items.map((t) => h("span", { className: "chip static", textContent: t })));

  const nodes: Node[] = [
    topbar(locked ? { text: "Locked in", tone: "live" } : undefined),
    h("h1", { textContent: settings.onboarded ? "Settings" : `Set up ${BRAND.NAME}` }),
    h("p", { className: "lead", textContent: locked ? "Settings are locked until the session ends." : "Everything here stays on this computer." }),
    ...(isWin
      ? section(
          "Permissions",
          h("p", { textContent: "Windows needs no permissions. Tabhush reads the window in front and the address bar of Chrome, Edge, Brave, Opera, Vivaldi and Firefox." }),
          h("p", { className: "muted small", textContent: "To close a blocked tab it brings that browser window to the front for a moment and presses Ctrl+W." }),
        )
      : section(
          "Permissions",
          h("p", { textContent: permissions.accessibility ? "Accessibility: on. Window titles are read for your report." : "Accessibility: off. Your report will only show app names." }),
          permissions.accessibility ? null : h("div", { className: "row" }, allowAx),
          h("p", { className: "muted small", textContent: `The first time ${BRAND.NAME} reads or closes a browser tab, macOS asks to let it control that browser (Chrome, Safari, Brave, Edge, Arc…). Allow it, or blocked tabs can’t be closed. Firefox only shares its window title.` }),
          h("div", { className: "row" }, openAuto),
        )),
    ...section(
      "Tracking",
      toggle("Track all day", "trackAllDay", "Log which app, site and window is in front whenever the app runs, not only during sessions. This is what the Activity report shows."),
      toggle("Open at login", "openAtLogin", `${BRAND.NAME} starts in the menu bar when you log in.`),
    ),
    ...section(
      "School sites",
      h("p", { className: "muted small", textContent: "Your school’s course, quiz and sign-in sites. Never blocked, like Canvas and Gradescope." }),
      schoolSites,
      h("div", { className: "row" }, saveSchool),
    ),
    ...section(
      "Essentials",
      h("p", { className: "muted small", textContent: "Sites that are never blocked, one per line. Subdomains are included." }),
      essentials,
      h("div", { className: "spread" }, saved, saveEssentials),
      err,
    ),
    ...section(
      "Always allowed",
      h("p", { className: "muted small", textContent: "Never blocked: these sites, the apps Claude, ChatGPT and Blender, work apps (developer tools, productivity, education, design), and your school sites." }),
      chips(OWNER_RULES.ALWAYS_ALLOWED_TOOLS),
      h("p", { className: "muted small", textContent: isWin ? "Music is always allowed: Spotify and music on YouTube." : `Music is always allowed and turned down to ${Math.round(OWNER_RULES.MUSIC_VOLUME * 100)}%: Spotify and Music apps, and music on YouTube.` }),
    ),
    ...section(
      "Blocked during a session",
      h("p", { className: "muted small", textContent: "Games, social apps and streaming apps are quit; distracting tabs are closed in every browser." }),
      chips(DESKTOP.DISTRACTION_APP_NAMES),
    ),
    ...section("Privacy", h("p", { textContent: "Everything is decided and stored on this computer. No titles, addresses, app names or task names are sent anywhere." })),
    ...section(
      "Diagnostics",
      h("p", { className: "muted small", textContent: "For testers: if tracking or blocking doesn’t work, send this to whoever gave you the app." }),
      h("code", { className: "diag", textContent: `${platform ?? "?"} · helper: ${helperError ?? "ok"}` }),
    ),
  ];

  nodes.push(
    ...section(
      "Credits",
      h(
        "p",
        { className: "muted small" },
        `Site categories are adapted from the ${CATEGORY_LIST.SOURCE}, licensed ${CATEGORY_LIST.LICENSE}. `,
        h("a", { href: "categories/NOTICE.txt", textContent: "Details" }),
      ),
    ),
  );
  if (!settings.onboarded) nodes.push(h("div", { attrs: { style: "margin-top:24px" } }, finish));
  main.replaceChildren(...nodes);
}

onStateChange(() => void render());
void render();
