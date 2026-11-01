// Consent before the first tier 3 call (PRIV-60): show exactly what gets sent and ask for an
// explicit opt-in. Declining turns on on-device-only mode (INV-10).

import { BRAND, LLM } from "@lockin/core";
import { call, h, setTitle } from "./common";

setTitle("Before the first AI check");
const main = document.querySelector("main")!;
const accept = h("button", { className: "primary", textContent: "Allow AI checks" });
const decline = h("button", { textContent: "Keep everything on this device" });
const status = h("p", { attrs: { role: "status" } });
accept.addEventListener("click", () => void call({ type: "ui:consent", granted: true }).then(() => (status.textContent = "AI checks are on. You can change this in settings.")));
decline.addEventListener("click", () => void call({ type: "ui:consent", granted: false }).then(() => (status.textContent = "On-device only mode is on. You can change this in settings.")));

main.append(
  h("h1", { textContent: "Before the first AI check" }),
  h("p", {
    textContent: `${BRAND.NAME} decides most pages on this device. For pages it can’t decide, it can ask an AI model (OpenAI) through ${BRAND.NAME}’s server. This is what would be sent:`,
  }),
  h(
    "ul",
    {},
    h("li", { textContent: "Your task label, with names, emails, phone numbers, long numbers and links removed" }),
    h("li", { textContent: "The page’s domain (for example docs.google.com)" }),
    h("li", { textContent: `The page title, with the same things removed and cut to ${LLM.TITLE_MAX_CHARS} characters` }),
    h("li", { textContent: "Any sentence you type to explain an override, with the same things removed" }),
  ),
  h("p", { textContent: "Email, chat, banking and health sites send the domain only, never titles. Screenshots, page content, full web addresses and what you type on pages never leave your device." }),
  h("p", { textContent: `Requests carry a token tied to this browser install, so ${BRAND.NAME}’s server can tell which install sent them. They are processed, not stored by us.` }),
  h("p", { textContent: "If you decline, nothing is ever sent and everything runs on this device only." }),
  h("div", { className: "row" }, accept, decline),
  status,
);
