// End-to-end session flow against a fake chrome API (QA-11 paths through the real engine):
// Start → clarify → sweep preview → Confirm → park → undo / End.
import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeEmbed, makeChrome } from "./fakeChrome";

vi.mock("../src/background/embedder", () => ({ embed: async (texts: string[]) => fakeEmbed(texts) }));

const W1 = 1;
const W2 = 2;
const TABS = [
  { id: 1, windowId: W1, url: "https://docs.google.com/document/d/abc/edit", title: "Lab report draft chemistry", active: true },
  { id: 2, windowId: W1, url: "https://www.netflix.com/watch/123", title: "Netflix", active: false },
  { id: 3, windowId: W1, url: "https://canvas.instructure.com/courses/1/quizzes/9", title: "Quiz 3: Unrelated Topic", active: false },
  { id: 4, windowId: W1, url: "https://example.org/funny", title: "Funny cats compilation", active: false },
  { id: 5, windowId: W2, url: "https://news.example.com/", title: "Morning news", active: true },
  { id: 6, windowId: W2, url: "https://piazza.com/class/x", title: "Class forum", active: false },
];

const asTab = (t: object) => t as chrome.tabs.Tab;

type Engine = typeof import("../src/background/engine");
type Session = typeof import("../src/background/session");
let fake: ReturnType<typeof makeChrome>;
let engine: Engine;
let session: Session;

beforeEach(async () => {
  vi.resetModules();
  vi.stubGlobal("indexedDB", new IDBFactory()); // a fresh database per test
  fake = makeChrome(TABS, { focusedWindow: W1 });
  vi.stubGlobal("chrome", fake.chrome);
  engine = await import("../src/background/engine");
  session = await import("../src/background/session");
});

async function startToPreview() {
  await engine.start();
  let s = await session.loadSession();
  expect(s?.state).toBe("CLARIFY"); // no recent tasks and tier 3 unavailable → clarify
  await engine.clarify("Lab report chemistry");
  s = await session.loadSession();
  expect(s?.state).toBe("SWEEP_PREVIEW");
  return s!;
}

describe("Start → clarify → sweep preview", () => {
  it("opens the session page and asks what the session is for", async () => {
    await engine.start();
    expect(fake.created.some((u) => u.endsWith("ui/session.html"))).toBe(true);
    expect((await session.loadSession())?.state).toBe("CLARIFY");
  });

  it("proposes Netflix for parking, never Canvas, and asks about the other window as a whole", async () => {
    const s = await startToPreview();
    expect(s.preview.map((p) => p.tabId)).toEqual([2]);
    expect(s.separate).toHaveLength(1);
    expect(s.separate[0]!.tabIds.sort()).toEqual([5, 6]);
  });

  it("parks nothing before Confirm in the first 5 sessions (LOOP-04)", async () => {
    await startToPreview();
    expect(fake.overlaysShownOn()).toEqual([]);
    expect(fake.rules()).toEqual([]);
  });

  it("Confirm waits until every separate context is answered", async () => {
    await startToPreview();
    await engine.confirm();
    expect((await session.loadSession())?.state).toBe("SWEEP_PREVIEW");
  });
});

describe("Confirm, undo, End", () => {
  async function confirmWith(parkOtherWindow: boolean) {
    const s = await startToPreview();
    await engine.answerSeparate(s.separate[0]!.id, parkOtherWindow);
    await engine.confirm();
    return (await session.loadSession())!;
  }

  it("parks with mute + overlay and installs pre-blocks", async () => {
    const s = await confirmWith(false);
    expect(s.state).toBe("ACTIVE");
    expect(fake.overlaysShownOn()).toEqual([2]);
    expect(fake.muted.get(2)).toBe(true);
    expect(fake.rules().length).toBeGreaterThan(0);
  });

  it("INV-01: 'Park all' on a separate window still never parks a learning platform", async () => {
    await confirmWith(true);
    expect(fake.overlaysShownOn()).toContain(5);
    expect(fake.overlaysShownOn()).not.toContain(6); // piazza.com
    expect(fake.overlaysShownOn()).not.toContain(3); // canvas
  });

  it("undo within 30 s restores every item the sweep parked", async () => {
    await confirmWith(false);
    await engine.undo();
    const s = (await session.loadSession())!;
    expect(Object.keys(s.parked)).toEqual([]);
    expect(fake.overlaysHiddenOn()).toContain(2);
    expect(fake.muted.get(2)).toBe(false);
  });

  it("undo after 30 s does nothing", async () => {
    await confirmWith(false);
    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now + 31_000);
    await engine.undo();
    expect(Object.keys((await session.loadSession())!.parked)).toEqual(["2"]);
    vi.restoreAllMocks();
  });

  it("End: needs a reason, counts down 2 minutes, marks ended early, lifts everything", async () => {
    await confirmWith(false);
    expect(await engine.requestEnd("  ")).toBe(false);
    expect(await engine.requestEnd("done for today")).toBe(true);
    let s = (await session.loadSession())!;
    expect(s.state).toBe("END_COUNTDOWN");
    expect(fake.alarms.get(engine.END_ALARM)! - s.endCountdown!.startedAt).toBe(120_000);
    expect(s.bail).toBe(true); // within 2 minutes of a park
    await engine.finishEnd();
    s = (await session.loadSession())!;
    expect(s.state).toBe("ENDED");
    expect(s.endKind).toBe("early");
    expect(fake.overlaysHiddenOn()).toContain(2);
    expect(fake.rules()).toEqual([]);
  });

  it("INV-14: an update that arrived mid-session is applied at End", async () => {
    await confirmWith(false);
    const { setInternal } = await import("../src/background/settings");
    await setInternal({ pendingUpdate: true });
    await engine.requestEnd("done");
    expect(fake.chrome.runtime.reload).not.toHaveBeenCalled();
    await engine.finishEnd();
    expect(fake.chrome.runtime.reload).toHaveBeenCalled();
  });
});

describe("Active session", () => {
  async function active() {
    const s = await startToPreview();
    await engine.answerSeparate(s.separate[0]!.id, false);
    await engine.confirm();
  }

  it("a new pure-distraction page is parked; a related page is allowed", async () => {
    await active();
    const tab = { id: 50, windowId: W1, groupId: -1, url: "https://www.tiktok.com/@x", title: "TikTok", active: true };
    fake.tabs.set(50, { ...tab, lastAccessed: Date.now() });
    await fake.chrome.scripting.executeScript({ target: { tabId: 50 } });
    await engine.onTabChanged(asTab(tab));
    expect(fake.overlaysShownOn()).toContain(50);

    const ok = { id: 51, windowId: W1, groupId: -1, url: "https://example.org/chemistry-lab-report-guide", title: "Lab report chemistry guide", active: true };
    await engine.onTabChanged(asTab(ok));
    expect(fake.overlaysShownOn()).not.toContain(51);
  });

  it("INV-02: a low-similarity page with no second signal is asked about, not parked", async () => {
    await active();
    const tab = { id: 60, windowId: W1, groupId: -1, url: "https://random.example.net/page", title: "Something else entirely", active: true };
    fake.tabs.set(60, { ...tab, lastAccessed: Date.now() });
    await fake.chrome.scripting.executeScript({ target: { tabId: 60 } });
    await engine.onTabChanged(asTab(tab));
    expect(fake.overlaysShownOn()).not.toContain(60);
    expect(fake.contentMessages.some((m) => m.tabId === 60 && m.msg.type === "ask:show")).toBe(true);
  });

  it("answering No to the ask parks the tab and remembers it", async () => {
    await active();
    const tab = { id: 61, windowId: W1, groupId: -1, url: "https://random.example.net/other", title: "Something else", active: true };
    fake.tabs.set(61, { ...tab, lastAccessed: Date.now() });
    await fake.chrome.scripting.executeScript({ target: { tabId: 61 } });
    await engine.onTabChanged(asTab(tab));
    await engine.answerAsk(asTab(tab), false);
    expect(fake.overlaysShownOn()).toContain(61);
  });

  it("an unreachable page judged unrelated is closed and goes on the restore list (EXT-08)", async () => {
    await active();
    const tab = { id: 70, windowId: W1, groupId: -1, url: "https://chromewebstore.google.com/detail/x", title: "Chrome Web Store", active: true };
    fake.tabs.set(70, { ...tab, lastAccessed: Date.now() });
    await engine.onTabChanged(asTab(tab));
    await engine.answerAsk(asTab(tab), false);
    expect(fake.removed).toContain(70);
    expect((await session.loadSession())!.restoreList.map((r) => r.url)).toContain(tab.url);
  });

  it("Q-38: with tier 3 unavailable an override is accepted for this session and logged", async () => {
    await active();
    const netflix = { ...TABS[1]!, groupId: -1 };
    expect(await engine.override(asTab(netflix), "I need this for my film class")).toBe("accepted");
    const s = (await session.loadSession())!;
    expect(Object.keys(s.parked)).not.toContain("2");
    expect(fake.overlaysHiddenOn()).toContain(2);
    expect(s.overrideLog).toEqual([expect.objectContaining({ domain: "netflix.com", judged: false, sentence: "I need this for my film class" })]);
    expect(s.suspensions.some((x) => x.startsWith("Override (not checked)"))).toBe(true);
    expect(s.liftedDomains).toContain("netflix.com"); // the pre-block lifts for this session only
  });

  it("an override still needs a sentence", async () => {
    await active();
    expect(await engine.override(asTab({ ...TABS[1]!, groupId: -1 }), "   ")).toBe("unavailable");
    expect(Object.keys((await session.loadSession())!.parked)).toContain("2");
  });

  it("the override does not outlive the session (LOCK-04)", async () => {
    await active();
    await engine.override(asTab({ ...TABS[1]!, groupId: -1 }), "film class");
    await engine.requestEnd("done");
    await engine.finishEnd();
    expect(fake.rules()).toEqual([]);
    await engine.dismiss();
    await engine.start();
    await engine.clarify("Lab report chemistry");
    const next = (await session.loadSession())!;
    expect(next.overrides).toEqual({});
    expect(next.liftedDomains).not.toContain("netflix.com");
    expect(next.preview.map((p) => p.tabId)).toContain(2); // proposed for parking again
  });

  it("the blocked page override lifts a pure-distraction domain (CLS-55)", async () => {
    await active();
    expect(await engine.overrideBlocked("https://www.steampowered.com/app/1", "game design class assignment")).toBe("accepted");
    expect((await session.loadSession())!.liftedDomains).toContain("steampowered.com");
  });
});
