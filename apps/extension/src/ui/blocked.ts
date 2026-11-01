// Target of the pre-block redirect for pure-distraction domains (LOOP-09). The original URL
// arrives in the fragment and never leaves the device. It goes on the restore list.

import { BRAND, itemDomain } from "@lockin/core";
import { call, h, setTitle } from "./common";

const original = (() => {
  const raw = location.hash.slice(1);
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
})();
const domain = itemDomain(original) ?? "this site";
setTitle("Blocked for this session");
const main = document.querySelector("main")!;

void call<boolean>({ type: "ui:blocked", url: original }).then((active) => {
  if (!active && /^https?:/.test(original)) {
    // No session holds this block (rules left behind): fail open.
    location.replace(original);
    return;
  }
  main.append(
    h("h1", { textContent: "Blocked for this session" }),
    h("p", { textContent: `${domain} is blocked while you’re locked in. It’s on your restore list for when the session ends.` }),
    h("p", { className: "muted", textContent: `${BRAND.NAME} never lifts this on its own.` }),
    overrideForm(),
  );
});

function overrideForm(): HTMLElement {
  const text = h("input", { type: "text", attrs: { "aria-label": "Why is this for your task? (one sentence)" }, placeholder: "Why is this for your task? (one sentence)" });
  const submit = h("button", { textContent: "This is for my task" });
  const status = h("p", { attrs: { role: "status" } });
  submit.addEventListener("click", () => {
    const sentence = text.value.replace(/\s+/g, " ").trim();
    if (!sentence) return;
    void call<"accepted" | "refused" | "unavailable">({ type: "ui:overrideBlocked", url: original, sentence }).then((r) => {
      if (r === "accepted") location.replace(original);
      else status.textContent = r === "refused" ? "Not accepted for this task. You can still end the session." : "This can’t be checked right now. You can still end the session.";
    });
  });
  return h("div", {}, text, h("div", { className: "row" }, submit), status);
}
