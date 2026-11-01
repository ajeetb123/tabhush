// Target of the pre-block redirect for pure-distraction domains (LOOP-09). The original URL
// arrives in the fragment and never leaves the device; it goes on the restore list.
// Owner rule (Q-63): no override here; the block holds until the session ends.

import { itemDomain } from "@lockin/core";
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
  const back = h("button", { className: "btn", textContent: "Go back" });
  back.addEventListener("click", () => history.back());
  main.append(
    h(
      "div",
      { className: "card" },
      h("img", { className: "mark", src: chrome.runtime.getURL("icons/logo.svg"), alt: "" }),
      h("h1", { textContent: "Not during this session" }),
      h("p", { className: "chips", attrs: { style: "justify-content:center;margin:14px 0" } }, h("span", { className: "chip static", textContent: domain })),
      h("p", { className: "muted", textContent: "It’s saved on your reopen list for when you’re done." }),
      h("div", { className: "row", attrs: { style: "justify-content:center;margin-top:18px" } }, back),
    ),
  );
});
