// @vitest-environment happy-dom
// INV-17 (overlay keeps page state), INV-07 (input counts only), QA-30 (accessible overlay).
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const sent: unknown[] = [];
let listener: ((msg: unknown, sender: unknown, respond: (r: unknown) => void) => boolean) | null = null;
let content: typeof import("../src/content/content");

beforeAll(async () => {
  vi.stubGlobal("chrome", {
    runtime: {
      sendMessage: vi.fn(async (m: unknown) => void sent.push(m)),
      getURL: (p: string) => `chrome-extension://test/${p}`,
      onMessage: { addListener: (fn: typeof listener) => (listener = fn) },
    },
  });
  content = await import("../src/content/content");
});

beforeEach(() => {
  sent.length = 0;
  listener!({ type: "overlay:hide" }, {}, () => undefined);
});

describe("INV-17 overlays keep page state", () => {
  it("covers the page without removing, resetting or navigating anything", () => {
    document.body.innerHTML = `<form><input id="draft" value=""></form><p id="quiz">Question 3 of 10</p>`;
    const input = document.getElementById("draft") as HTMLInputElement;
    input.value = "half-written answer";
    const href = location.href;
    listener!({ type: "overlay:show", taskLabel: "Lab report", canOverride: true }, {}, () => undefined);
    expect(document.getElementById("tabhush-root")).not.toBeNull();
    expect((document.getElementById("draft") as HTMLInputElement).value).toBe("half-written answer");
    expect(document.getElementById("quiz")!.textContent).toBe("Question 3 of 10");
    expect(location.href).toBe(href);
    listener!({ type: "overlay:hide" }, {}, () => undefined);
    expect(input.value).toBe("half-written answer");
  });

  it("pauses media on park and re-pauses it on every play event", () => {
    document.body.innerHTML = `<video id="v"></video>`;
    const v = document.getElementById("v") as HTMLVideoElement;
    const pause = vi.spyOn(v, "pause");
    listener!({ type: "overlay:show", taskLabel: "Lab report", canOverride: false }, {}, () => undefined);
    v.dispatchEvent(new Event("play"));
    expect(pause).toHaveBeenCalled();
    pause.mockClear();
    listener!({ type: "overlay:hide" }, {}, () => undefined);
    v.dispatchEvent(new Event("play"));
    expect(pause).not.toHaveBeenCalled();
  });
});

describe("INV-07 input is measured as counts only", () => {
  it("never sends keys, targets or text", async () => {
    document.body.innerHTML = `<input id="secret">`;
    const field = document.getElementById("secret")!;
    for (const key of ["p", "a", "s", "s"]) field.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
    window.dispatchEvent(new Event("pagehide"));
    const payload = JSON.stringify(sent);
    expect(payload).not.toMatch(/"key"|secret|"p"|pass/);
    for (const m of sent as Record<string, unknown>[]) {
      if (m.type === "input:counts") expect(Object.keys(m).sort()).toEqual(["count", "minuteStart", "type"]);
    }
  });
});

describe("QA-30 accessible overlay", () => {
  it("is a labelled modal dialog with focus inside", () => {
    listener!({ type: "overlay:show", taskLabel: "Lab report", canOverride: true }, {}, () => undefined);
    const root = content.shadowRootForTests()!;
    const dialog = root.querySelector('[role="dialog"]')!;
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(root.getElementById(dialog.getAttribute("aria-labelledby")!)?.textContent).toBe("Blocked for this session");
    expect(root.activeElement?.tagName).toBe("BUTTON");
  });

  it("keeps Tab focus inside the overlay", () => {
    listener!({ type: "overlay:show", taskLabel: "Lab report", canOverride: true }, {}, () => undefined);
    const root = content.shadowRootForTests()!;
    const buttons = [...root.querySelectorAll<HTMLButtonElement>("button")].filter((b) => !b.hidden && !b.closest("[hidden]"));
    buttons[buttons.length - 1]!.focus();
    const ev = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    buttons[buttons.length - 1]!.dispatchEvent(ev);
    expect(root.activeElement).toBe(buttons[0]);
  });

  it("keys pressed in the overlay never reach the page", () => {
    const seen = vi.fn();
    document.addEventListener("keydown", seen);
    listener!({ type: "overlay:show", taskLabel: "Lab report", canOverride: true }, {}, () => undefined);
    const root = content.shadowRootForTests()!;
    root.querySelector("button")!.dispatchEvent(new KeyboardEvent("keydown", { key: "x", bubbles: true, composed: true }));
    expect(seen).not.toHaveBeenCalled();
    document.removeEventListener("keydown", seen);
  });
});

describe("sampled park check (docs/14)", () => {
  it("asks 'Was this park right?' only when the park was sampled and reports the answer", () => {
    listener!({ type: "overlay:show", taskLabel: "Lab report", canOverride: false }, {}, () => undefined);
    expect(content.shadowRootForTests()!.querySelector('[aria-label="Was this park right?"]')).toBeNull();
    listener!({ type: "overlay:show", taskLabel: "Lab report", canOverride: false, sampledCheck: true }, {}, () => undefined);
    const group = content.shadowRootForTests()!.querySelector('[aria-label="Was this park right?"]')!;
    (group.querySelectorAll("button")[1] as HTMLButtonElement).click();
    expect(sent).toContainEqual({ type: "check:answer", right: false });
  });
});
