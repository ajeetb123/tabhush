// End-to-end session flow against a fake chrome API (QA-11 paths through the real engine):
// Start → clarify → sweep preview → Confirm → park → End. Includes the owner rules (Q-63).
import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeEmbed, makeChrome } from "./fakeChrome";

vi.mock("../src/background/embedder", () => ({ embed: async (texts: string[]) => fakeEmbed(texts) }));
// Q-08 shipped categories: one games site, and a courseware domain wrongly listed to prove INV-01 wins.
vi.mock("../src/background/categories", () => ({
  getCategoryTable: async () =>
    new Map([
      ["arcade.example.com", "games"],
      ["instructure.com", "entertainment"],
      ["youtube.com", "entertainment"],
      ["chromewebstore.google.com", "shopping"],
    ]),
  getBankingDomains: async () => new Set<string>(),
  getUndergroundDomains: async () => new Set<string>(["pirate-example.to"]),
}));

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
  await engine.clarify(["Lab report chemistry"]);
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

  it("Q-63: a sweep can't be undone; blocks hold until End", async () => {
    await confirmWith(false);
    await engine.undo();
    expect(Object.keys((await session.loadSession())!.parked)).toEqual(["2"]);
    expect(fake.overlaysHiddenOn()).not.toContain(2);
  });

  it("End: needs a reason, counts down 30 seconds (Q-63), marks ended early, lifts everything", async () => {
    await confirmWith(false);
    expect(await engine.requestEnd("  ")).toBe(false);
    expect(await engine.requestEnd("done for today")).toBe(true);
    let s = (await session.loadSession())!;
    expect(s.state).toBe("END_COUNTDOWN");
    expect(fake.alarms.get(engine.END_ALARM)! - s.endCountdown!.startedAt).toBe(30_000);
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

  it("CLS-21: a low-similarity page in a shipped park category is parked on device (Q-08)", async () => {
    await active();
    const tab = { id: 80, windowId: W1, groupId: -1, url: "https://arcade.example.com/play", title: "Free online arcade", active: true };
    fake.tabs.set(80, { ...tab, lastAccessed: Date.now() });
    await fake.chrome.scripting.executeScript({ target: { tabId: 80 } });
    await engine.onTabChanged(asTab(tab));
    expect(fake.overlaysShownOn()).toContain(80);
    expect((await session.loadSession())!.parked["80"]?.source).toBe("on_device_path");
  });

  it("INV-01: courseware in a shipped category is still never parked", async () => {
    await active();
    const tab = { id: 81, windowId: W1, groupId: -1, url: "https://canvas.instructure.com/courses/2/videos", title: "Totally unrelated video", active: true };
    fake.tabs.set(81, { ...tab, lastAccessed: Date.now() });
    await fake.chrome.scripting.executeScript({ target: { tabId: 81 } });
    await engine.onTabChanged(asTab(tab));
    expect(fake.overlaysShownOn()).not.toContain(81);
  });

  async function open(id: number, url: string, title: string) {
    const tab = { id, windowId: W1, groupId: -1, url, title, active: true };
    fake.tabs.set(id, { ...tab, lastAccessed: Date.now() });
    await fake.chrome.scripting.executeScript({ target: { tabId: id } });
    await engine.onTabChanged(asTab(tab));
    return tab;
  }

  it("INV-02 + Q-63: a low-similarity page with no second signal stays open, with no question", async () => {
    await active();
    await open(60, "https://random.example.net/page", "Something else entirely");
    expect(fake.overlaysShownOn()).not.toContain(60);
    expect(fake.contentMessages.some((m) => m.tabId === 60 && m.msg.type === "ask:show")).toBe(false);
    expect((await session.loadSession())!.flagged.length).toBeGreaterThan(0);
  });

  it("an unreachable page judged unrelated is closed and goes on the restore list (EXT-08)", async () => {
    await active();
    const tab = { id: 70, windowId: W1, groupId: -1, url: "https://chromewebstore.google.com/detail/x", title: "Chrome Web Store", active: true };
    fake.tabs.set(70, { ...tab, lastAccessed: Date.now() });
    await engine.onTabChanged(asTab(tab));
    expect(fake.removed).toContain(70);
    expect((await session.loadSession())!.restoreList.map((r) => r.url)).toContain(tab.url);
  });

  it("Q-63: no override; a blocked page stays blocked", async () => {
    await active();
    expect(await engine.override(asTab({ ...TABS[1]!, groupId: -1 }), "I need this for my film class")).toBe("unavailable");
    expect(await engine.overrideBlocked("https://www.steampowered.com/app/1", "game design class")).toBe("unavailable");
    const s = (await session.loadSession())!;
    expect(Object.keys(s.parked)).toContain("2");
    expect(s.liftedDomains).not.toContain("steampowered.com");
  });

  it("Q-63: the overlay offers no override", async () => {
    await active();
    const shown = fake.contentMessages.find((m) => m.tabId === 2 && m.msg.type === "overlay:show")!.msg as unknown as { canOverride: boolean };
    expect(shown.canOverride).toBe(false);
  });

  it("Q-63: YouTube home and search stay open; an unrelated video is blocked", async () => {
    await active();
    await open(90, "https://www.youtube.com/", "YouTube");
    await open(91, "https://www.youtube.com/results?search_query=titration", "titration - YouTube");
    await open(92, "https://www.youtube.com/watch?v=cats1", "Funny cat compilation - YouTube");
    expect(fake.overlaysShownOn()).not.toContain(90);
    expect(fake.overlaysShownOn()).not.toContain(91);
    expect(fake.overlaysShownOn()).toContain(92);
  });

  it("Q-63: a YouTube video labelled Music is allowed and turned down to 30%", async () => {
    await active();
    const tab = await open(93, "https://www.youtube.com/watch?v=song1", "Some Song (Official Audio) - YouTube");
    expect(fake.overlaysShownOn()).toContain(93); // judged before the genre arrives
    await engine.onYoutubeMeta(asTab(tab), "song1", "Music");
    expect(fake.overlaysHiddenOn()).toContain(93);
    expect(fake.contentMessages).toContainEqual({ tabId: 93, msg: { type: "music:on", volume: 0.3 } });
  });

  it("Q-63: a Music label for a different video does not count", async () => {
    await active();
    const tab = await open(94, "https://www.youtube.com/watch?v=cats2", "Funny cats again - YouTube");
    await engine.onYoutubeMeta(asTab(tab), "someOtherVideo", "Music");
    expect(Object.keys((await session.loadSession())!.parked)).toContain("94");
  });

  it("Q-63: Spotify, Claude, ChatGPT, Blender and Stack Overflow are always allowed", async () => {
    await active();
    await open(100, "https://open.spotify.com/playlist/x", "Spotify");
    await open(101, "https://claude.ai/new", "Claude");
    await open(102, "https://chatgpt.com/", "ChatGPT");
    await open(103, "https://www.blender.org/download/", "Blender");
    await open(104, "https://stackoverflow.com/questions/1/x", "Unrelated Java question");
    for (const id of [100, 101, 102, 103, 104]) expect(fake.overlaysShownOn()).not.toContain(id);
  });

  it("Q-63: underground streaming sites are blocked (UT1 warez and streameast variants)", async () => {
    await active();
    await open(110, "https://streameast.app/nba/1", "NBA live");
    await open(111, "https://www.streameast-to.live/x", "Live sports");
    await open(112, "https://pirate-example.to/movie", "Watch free");
    for (const id of [110, 111, 112]) expect(fake.overlaysShownOn()).toContain(id);
  });
});

describe("Q-63 several tasks at once", () => {
  it("the clarify answer can name several tasks; pages for any of them stay open", async () => {
    await engine.start();
    await engine.clarify(["Lab report chemistry", "Internship resume"]);
    const s = (await session.loadSession())!;
    expect(s.state).toBe("SWEEP_PREVIEW");
    expect(s.taskIds).toHaveLength(2);
    expect(s.taskLabel).toBe("Lab report chemistry + Internship resume");
    await engine.answerSeparate(s.separate[0]!.id, false);
    await engine.confirm();
    const tab = { id: 120, windowId: W1, groupId: -1, url: "https://example.org/resume-tips", title: "Internship resume tips", active: true };
    fake.tabs.set(120, { ...tab, lastAccessed: Date.now() });
    await fake.chrome.scripting.executeScript({ target: { tabId: 120 } });
    await engine.onTabChanged(asTab(tab));
    expect(fake.overlaysShownOn()).not.toContain(120);
  });
});
