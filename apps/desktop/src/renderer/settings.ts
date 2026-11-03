// Settings (and the first-run setup, EXT-12 on desktop): permissions, tracking and login (Q-70),
// and a plain word on privacy. School pages are recognized on their own (Q-74), so there is no list
// to keep. Locked during a session (LOCK-01). The UT1 list credit ships in the app's NOTICE file.

import { BRAND } from "@lockin/core";
import type { Settings } from "../shared/types";
import { call, getSnapshot, h, onStateChange, playEnter, setTitle, topbar } from "./common";

setTitle("Settings");
const main = document.querySelector("main")!;

function section(title: string, ...children: (Node | null)[]): Node[] {
  return [h("h2", { textContent: title }), h("div", { className: "card stack" }, ...children.filter((c): c is Node => c !== null))];
}

async function render(): Promise<void> {
  const { settings, session, permissions, platform } = await getSnapshot();
  const isWin = platform === "win32";
  const locked = session !== null && session.state !== "IDLE" && session.state !== "ENDED";
  const err = h("p", { className: "error", attrs: { role: "alert" } });
  const saved = h("p", { className: "muted small", attrs: { role: "status" } });
  const save = (patch: { type: "settings"; patch: Partial<Settings> }) =>
    call(patch).then(
      () => (saved.textContent = "Saved."),
      (e: Error) => (err.textContent = e.message),
    );

  const allowAx = h("button", { className: "btn primary", textContent: "Allow Accessibility" });
  allowAx.addEventListener("click", () => void call({ type: "requestAccessibility" }).then(() => call({ type: "openPrivacyPane", pane: "accessibility" })));
  const openAuto = h("button", { className: "btn", textContent: "Open Automation settings" });
  openAuto.addEventListener("click", () => void call({ type: "openPrivacyPane", pane: "automation" }));

  const toggle = (label: string, key: "trackAllDay" | "openAtLogin" | "countOtherWork", hint: string) => {
    const box = h("input", { type: "checkbox", className: "switch", checked: settings[key], disabled: locked, attrs: { role: "switch", "aria-label": label } });
    box.addEventListener("change", () => void save({ type: "settings", patch: { [key]: box.checked } }));
    return h("label", { className: "setting" }, h("div", { className: "txt" }, h("b", { textContent: label }), h("p", { className: "muted small", textContent: hint })), box);
  };

  const finish = h("button", { className: "btn primary block", textContent: "Done, take me to Start" });
  finish.addEventListener("click", () => void call({ type: "settings", patch: { onboarded: true } }).then(() => location.replace("session.html")));


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
      toggle(
        "Count other productive work",
        "countOtherWork",
        "If you drift to another of your tasks during a session (say, your resume during a CS session), that time shows as other productive work for that task instead of off task.",
      ),
      toggle("Open at login", "openAtLogin", `${BRAND.NAME} starts when you log in.`),
    ),
    ...section(
      "Your privacy",
      h("p", { textContent: "Tabhush only notes which apps and sites you spend your time on, so it can show you your own report and keep distractions away during a session." }),
      h("p", { className: "muted small", textContent: "It all stays on this computer. Nothing is uploaded, sold or shared, and there are no ads or accounts. Uninstalling Tabhush removes it." }),
    ),
    err,
    saved,
  ];

  if (!settings.onboarded) nodes.push(h("div", { attrs: { style: "margin-top:24px" } }, finish));
  main.replaceChildren(...nodes);
}

onStateChange(() => void render());
playEnter();
void render();
