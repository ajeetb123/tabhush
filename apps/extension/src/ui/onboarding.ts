// First-run setup (EXT-12): what Tabhush does and why Chrome warns about it, school sites that
// must never be blocked (LOCK-02), optional essentials, incognito access, pinning, and the
// minimum age from the Terms. Opens once on install; reachable later from settings.

import { BRAND } from "@lockin/core";
import { call, domainsFrom, getSnapshot, h, setTitle, topbar } from "./common";

setTitle("Welcome");
const main = document.querySelector("main")!;

function step(n: number, title: string, ...body: (Node | string | null)[]): HTMLElement {
  return h(
    "div",
    { className: "card stack" },
    h("div", { className: "row" }, h("span", { className: "pill", textContent: String(n) }), h("b", { textContent: title })),
    ...body.filter((b): b is Node | string => b !== null),
  );
}

async function render(): Promise<void> {
  const { settings } = await getSnapshot();
  const incognito = await chrome.extension.isAllowedIncognitoAccess();

  const school = h("textarea", {
    rows: 3,
    value: settings.schoolSites.join("\n"),
    placeholder: "canvas.vt.edu\nprairielearn.endeavour.cs.vt.edu",
    attrs: { "aria-label": "Your school’s course and sign-in sites" },
  });
  const essentials = h("textarea", {
    rows: 2,
    value: settings.essentials.join("\n"),
    placeholder: "notion.so",
    attrs: { "aria-label": "Sites you always need" },
  });
  const openExt = h("button", { className: "btn", textContent: "Open extension settings" });
  openExt.addEventListener("click", () => void chrome.tabs.create({ url: `chrome://extensions/?id=${chrome.runtime.id}` }));

  const age = h("input", { type: "checkbox", checked: settings.ageConfirmed, attrs: { "aria-label": "I’m 13 or older" } });
  const err = h("p", { className: "error", attrs: { role: "alert" } });
  const done = h("button", { className: "btn primary block", textContent: "Finish setup" });
  done.addEventListener("click", () => {
    if (!age.checked) return void (err.textContent = `You need to be 13 or older to use ${BRAND.NAME}.`);
    void call({
      type: "ui:settings",
      patch: { schoolSites: domainsFrom(school.value), essentials: domainsFrom(essentials.value), ageConfirmed: true, onboarded: true },
    })
      .then(() => {
        main.replaceChildren(
          topbar(),
          h("h1", { textContent: "You’re set" }),
          h("p", { className: "lead", textContent: `Click the ${BRAND.NAME} button in your toolbar and press Start when you’re ready to work.` }),
        );
      })
      .catch((e: Error) => (err.textContent = e.message));
  });

  main.replaceChildren(
    topbar(),
    h("h1", { textContent: `Welcome to ${BRAND.NAME}` }),
    h("p", { className: "lead", textContent: "Hit Start. It figures out what you’re working on and blocks everything else until you’re done." }),
    step(
      1,
      "About Chrome’s warning",
      h("p", { className: "muted", textContent: "Chrome says this extension can “read and change all your data on all websites”. It needs that to see which tab you’re on and to block the ones that aren’t part of your work." }),
      h("p", { className: "muted", textContent: "Everything is decided on this computer. Page titles, web addresses and what you type never leave it." }),
    ),
    step(
      2,
      "Your school’s sites",
      h("p", { className: "muted", textContent: "Course and quiz sites are never blocked. Canvas, Gradescope, Piazza and similar are covered already; add your school’s own addresses, like its Canvas, PrairieLearn or sign-in page." }),
      school,
    ),
    step(3, "Sites you always need (optional)", h("p", { className: "muted", textContent: "These are never blocked either. You can change them later, between sessions." }), essentials),
    step(
      4,
      "Incognito",
      h("p", { className: "muted", textContent: incognito ? "Incognito windows are covered." : "Incognito windows aren’t covered yet. On the extension page, switch on “Allow in Incognito”." }),
      incognito ? null : h("div", { className: "row" }, openExt),
    ),
    step(5, "Pin the button", h("p", { className: "muted", textContent: `Click the puzzle-piece icon next to the address bar and pin ${BRAND.NAME}, so Start is one click away.` })),
    h("label", { className: "row", attrs: { style: "margin:18px 0 10px" } }, age, "I’m 13 or older"),
    done,
    err,
  );
}

void render();
