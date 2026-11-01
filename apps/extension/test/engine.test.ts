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
/** Tabs blocked so far: closed (Q-67) or, where closing is off, covered. */
const blocked = () => [...fake.removed, ...fake.overlaysShownOn()];

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
  const s = await session.loadSession();
  expect(s?.state).toBe("SWEEP_PREVIEW"); // Q-64: no prompt, straight to the start screen
  return s!;
}

describe("Start (Q-64: no prompts)", () => {
  it("opens the start screen with a task named from the tabs", async () => {
    const s = await startToPreview();
    expect(fake.created.some((u) => u.endsWith("ui/session.html"))).toBe(true);
    expect(s.taskLabel).toBe("Lab report draft chemistry"); // front tab title, cut to 5 words
  });

  it("proposes Netflix for blocking, never Canvas or Piazza; other windows are judged tab by tab", async () => {
    const s = await startToPreview();
    expect(s.preview.map((p) => p.tabId)).toEqual([2]);
  });

  it("parks nothing before Lock in (LOOP-04)", async () => {
    await startToPreview();
    expect(blocked()).toEqual([]);
    expect(fake.rules()).toEqual([]);
  });

  it("several tasks can be set at once; a page for any of them stays open", async () => {
    await startToPreview();
    await engine.setTasks(["Calculus homework", "Internship resume"]);
    let s = (await session.loadSession())!;
    expect(s.taskIds).toHaveLength(2);
    expect(s.taskLabel).toBe("Calculus homework + Internship resume");
    await engine.confirm(45);
    const tab = { id: 120, windowId: W1, groupId: -1, url: "https://example.org/resume-tips", title: "Internship resume tips", active: true };
    fake.tabs.set(120, { ...tab, lastAccessed: Date.now() });
    await fake.chrome.scripting.executeScript({ target: { tabId: 120 } });
    await engine.onTabChanged(asTab(tab));
    expect(blocked()).not.toContain(120);
    s = (await session.loadSession())!;
    expect(s.goalMin).toBe(45);
  });

  it("near-duplicate task names merge silently (shared course code)", async () => {
    await startToPreview();
    await engine.setTasks(["CS2114 project"]);
    const first = (await session.loadSession())!.taskIds[0];
    await engine.setTasks(["CS2114 homework"]);
    expect((await session.loadSession())!.taskIds[0]).toBe(first);
  });

  it("can't lock in without a task", async () => {
    await startToPreview();
    await engine.setTasks([]);
    await engine.confirm(45);
    expect((await session.loadSession())!.state).toBe("SWEEP_PREVIEW");
  });
});

describe("Lock in, Stop, End", () => {
  async function confirmWith(goal = 45) {
    await startToPreview();
    await engine.confirm(goal);
    return (await session.loadSession())!;
  }

  it("Q-67: closes blocked tabs to the reopen list and installs pre-blocks", async () => {
    const s = await confirmWith();
    expect(s.state).toBe("ACTIVE");
    expect(fake.removed).toEqual([2]);
    expect(s.restoreList.map((r) => r.url)).toContain(TABS[1]!.url);
    expect(fake.rules().length).toBeGreaterThan(0);
  });

  it("Q-67: the last tab of a window becomes the blocked page instead of closing the window", async () => {
    await confirmWith();
    const lone = { id: 170, windowId: 9, groupId: -1, url: "https://www.netflix.com/title/9", title: "Netflix", active: true };
    fake.tabs.set(170, { ...lone, lastAccessed: Date.now() });
    await engine.onTabChanged(asTab(lone));
    expect(fake.removed).not.toContain(170);
    expect(fake.tabs.get(170)!.url).toMatch(/^chrome-extension:\/\/ownextensionid\/ui\/blocked\.html#/);
  });

  it("the goal is clamped to 15-240 minutes", async () => {
    expect((await confirmWith(5)).goalMin).toBe(15);
  });

  it("Q-64: Stop does nothing before the goal", async () => {
    await confirmWith(25);
    expect(await engine.stop()).toBe(false);
    expect((await session.loadSession())!.state).toBe("ACTIVE");
  });

  it("Q-64: past the goal, Stop ends at once as a normal end and lifts everything", async () => {
    await confirmWith(25);
    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now + 26 * 60_000);
    expect(await engine.stop()).toBe(true);
    const s = (await session.loadSession())!;
    vi.restoreAllMocks();
    expect(s.state).toBe("ENDED");
    expect(s.endKind).toBe("normal");
    expect(s.bail).toBe(false);
    expect(fake.rules()).toEqual([]);
  });

  it("past sessions feed the time-goal default", async () => {
    await confirmWith(25);
    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now + 40 * 60_000);
    await engine.stop();
    vi.restoreAllMocks();
    const history = await engine.sessionHistoryMinutes();
    expect(history).toHaveLength(1);
    expect(Math.round(history[0]!)).toBe(40);
  });

  it("Q-63: a sweep can't be undone; blocks hold until End", async () => {
    await confirmWith();
    const created = fake.created.length;
    await engine.undo();
    expect(fake.created.length).toBe(created); // nothing reopened
  });

  it("End: needs a reason, counts down 30 seconds (Q-63), marks ended early, lifts everything", async () => {
    await confirmWith();
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
    expect(fake.rules()).toEqual([]);
  });

  it("INV-14: an update that arrived mid-session is applied at End", async () => {
    await confirmWith();
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
    await startToPreview();
    await engine.confirm(45);
  }

  it("a new pure-distraction page is parked; a related page is allowed", async () => {
    await active();
    const tab = { id: 50, windowId: W1, groupId: -1, url: "https://www.tiktok.com/@x", title: "TikTok", active: true };
    fake.tabs.set(50, { ...tab, lastAccessed: Date.now() });
    await fake.chrome.scripting.executeScript({ target: { tabId: 50 } });
    await engine.onTabChanged(asTab(tab));
    expect(blocked()).toContain(50);

    const ok = { id: 51, windowId: W1, groupId: -1, url: "https://example.org/chemistry-lab-report-guide", title: "Lab report chemistry guide", active: true };
    await engine.onTabChanged(asTab(ok));
    expect(blocked()).not.toContain(51);
  });

  it("CLS-21: a low-similarity page in a shipped park category is parked on device (Q-08)", async () => {
    await active();
    const tab = { id: 80, windowId: W1, groupId: -1, url: "https://arcade.example.com/play", title: "Free online arcade", active: true };
    fake.tabs.set(80, { ...tab, lastAccessed: Date.now() });
    await fake.chrome.scripting.executeScript({ target: { tabId: 80 } });
    await engine.onTabChanged(asTab(tab));
    expect(blocked()).toContain(80);
    expect((await session.loadSession())!.blockEvents.map((e) => e.domain)).toContain("arcade.example.com");
  });

  it("INV-01: courseware in a shipped category is still never parked", async () => {
    await active();
    const tab = { id: 81, windowId: W1, groupId: -1, url: "https://canvas.instructure.com/courses/2/videos", title: "Totally unrelated video", active: true };
    fake.tabs.set(81, { ...tab, lastAccessed: Date.now() });
    await fake.chrome.scripting.executeScript({ target: { tabId: 81 } });
    await engine.onTabChanged(asTab(tab));
    expect(blocked()).not.toContain(81);
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
    expect(blocked()).not.toContain(60);
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
    expect(fake.removed).toContain(2);
    expect(s.liftedDomains).not.toContain("steampowered.com");
  });

  it("Q-63: YouTube home and search stay open; an unrelated video is blocked", async () => {
    await active();
    await open(90, "https://www.youtube.com/", "YouTube");
    await open(91, "https://www.youtube.com/results?search_query=titration", "titration - YouTube");
    const vid = await open(92, "https://www.youtube.com/watch?v=cats1", "Funny cat compilation - YouTube");
    await engine.onYoutubeMeta(asTab(vid), "cats1", null, "Funny cat compilation", "Cat Clips");
    expect(blocked()).not.toContain(90);
    expect(blocked()).not.toContain(91);
    expect(blocked()).toContain(92);
  });

  it("Q-67: a YouTube video is not judged before its genre/title report arrives", async () => {
    await active();
    await open(93, "https://www.youtube.com/watch?v=song1", "YouTube");
    expect(blocked()).not.toContain(93);
  });

  it("Q-63: a YouTube video labelled Music is allowed and turned down to 30%", async () => {
    await active();
    const tab = await open(93, "https://www.youtube.com/watch?v=song1", "Some Song - YouTube");
    await engine.onYoutubeMeta(asTab(tab), "song1", "Music", "Some Song", "Some Artist");
    expect(blocked()).not.toContain(93);
    expect(fake.contentMessages).toContainEqual({ tabId: 93, msg: { type: "music:on", volume: 0.3 } });
  });

  it("Q-67: a song reached by in-page navigation (no fresh genre) is allowed by its title", async () => {
    await active();
    const tab = await open(95, "https://www.youtube.com/watch?v=ncs1", "YouTube");
    await engine.onYoutubeMeta(asTab(tab), "ncs1", null, "Cartoon, Jéja - Why We Lose (feat. Coleman Trapp) | DnB | NCS", "NoCopyrightSounds");
    expect(blocked()).not.toContain(95);
  });

  it("Q-67: an auto-generated '- Topic' channel counts as music", async () => {
    await active();
    const tab = await open(96, "https://www.youtube.com/watch?v=t1", "YouTube");
    await engine.onYoutubeMeta(asTab(tab), "t1", null, "Blinding Lights", "The Weeknd - Topic");
    expect(blocked()).not.toContain(96);
  });

  it("Q-63: a Music label for a different video does not count", async () => {
    await active();
    const tab = await open(94, "https://www.youtube.com/watch?v=cats2", "Funny cats again - YouTube");
    await engine.onYoutubeMeta(asTab(tab), "someOtherVideo", "Music", "Other song", "");
    expect(blocked()).not.toContain(94); // still waiting for this video's own report
    await engine.onYoutubeMeta(asTab(tab), "cats2", null, "Funny cats again", "Cat Clips");
    expect(blocked()).toContain(94);
  });

  it("Q-63: Spotify, Claude, ChatGPT, Blender and Stack Overflow are always allowed", async () => {
    await active();
    await open(100, "https://open.spotify.com/playlist/x", "Spotify");
    await open(101, "https://claude.ai/new", "Claude");
    await open(102, "https://chatgpt.com/", "ChatGPT");
    await open(103, "https://www.blender.org/download/", "Blender");
    await open(104, "https://stackoverflow.com/questions/1/x", "Unrelated Java question");
    for (const id of [100, 101, 102, 103, 104]) expect(blocked()).not.toContain(id);
  });

  it("Q-63: underground streaming sites are blocked (UT1 warez and streameast variants)", async () => {
    await active();
    await open(110, "https://streameast.app/nba/1", "NBA live");
    await open(111, "https://www.streameast-to.live/x", "Live sports");
    await open(112, "https://pirate-example.to/movie", "Watch free");
    for (const id of [110, 111, 112]) expect(blocked()).toContain(id);
  });

  it("Q-64: a search for a distraction topic is blocked; a work search is not", async () => {
    await active();
    await open(130, "https://www.google.com/search?q=lebron+basketball+stats", "lebron basketball stats - Google Search");
    await open(131, "https://www.google.com/search?q=chemistry+titration+curve", "chemistry titration curve - Google Search");
    expect(blocked()).toContain(130);
    expect(blocked()).not.toContain(131);
    expect((await session.loadSession())!.blockEvents.map((e) => e.domain)).toContain("google.com");
  });

  it("Q-64: blocking one search does not block every search", async () => {
    await active();
    await open(132, "https://www.google.com/search?q=basketball+scores", "basketball scores - Google Search");
    await open(133, "https://www.google.com/search?q=lab+report+format", "lab report format - Google Search");
    expect(blocked()).toContain(132);
    expect(blocked()).not.toContain(133);
  });

  it("Q-64: course codes are remembered from normal tabs, never from incognito or webmail", async () => {
    await active();
    await open(140, "https://example.org/cs", "CS 2114 notes");
    const mail = { id: 141, windowId: W1, groupId: -1, url: "https://mail.google.com/mail/u/0", title: "MATH 1226 grades - Gmail", active: true };
    await engine.onTabChanged(asTab(mail));
    const priv = { id: 142, windowId: W1, groupId: -1, url: "https://example.org/x", title: "BIO 1105 private", active: true, incognito: true };
    await engine.onTabChanged(asTab(priv));
    const { profile } = (await fake.chrome.storage.local.get("profile")) as { profile?: { courses: string[] } };
    expect(profile?.courses).toEqual(["CS 2114"]);
  });

  it("Q-65: an unlisted piracy/movie page is blocked by what it's about", async () => {
    await active();
    const tab = await open(150, "https://yarrlist.net/", "YARRLIST");
    expect(blocked()).not.toContain(150); // no snippet yet: the title alone says nothing
    await engine.onPageSnippet(asTab(tab), tab.url, "YARRLIST. Watch free movies and tv shows online. Anime and manga. Torrents and pirated downloads. Live sports streams");
    expect(blocked()).toContain(150);
    expect((await session.loadSession())!.blockEvents.map((e) => e.domain)).toContain("yarrlist.net");
  });

  it("Q-65: a work page's snippet does not block it", async () => {
    await active();
    const tab = await open(151, "https://docs.example.org/titration", "Titration");
    await engine.onPageSnippet(asTab(tab), tab.url, "Titration lab report chemistry guide. How to write the lab report draft");
    expect(blocked()).not.toContain(151);
  });

  it("Q-65: a snippet never overrides never-locked or always-allowed pages", async () => {
    await active();
    const tab = await open(152, "https://canvas.instructure.com/courses/1/videos", "Course video");
    await engine.onPageSnippet(asTab(tab), tab.url, "Watch free movies and tv shows online. Movie trailers and film reviews");
    expect(blocked()).not.toContain(152);
  });

  it("Q-65: blocks and on-task time are recorded for the report", async () => {
    await active();
    await open(153, "https://www.netflix.com/title/1", "Netflix");
    const s = (await session.loadSession())!;
    expect(s.blockEvents.map((e) => e.domain)).toEqual(expect.arrayContaining(["netflix.com"]));
    expect(s.focusLog[0]?.state).toBe("on");
    await engine.onFocusChange(null);
    expect((await session.loadSession())!.focusLog.at(-1)?.state).toBe("away");
  });
});

describe("refreshing a blocked page", () => {
  it("is covered again before it shows (document_start answer)", async () => {
    await engine.start();
    await engine.confirm(45);
    // Tab 2 (Netflix) was blocked by the sweep; a refresh reloads its content script.
    const r = await engine.onContentReady(asTab({ ...TABS[1]!, groupId: -1 }));
    expect(r).toMatchObject({ blocked: true, canOverride: false });
  });

  it("a page blocked by its topic stays blocked after a refresh, and in a new tab", async () => {
    await engine.start();
    await engine.confirm(45);
    const tab = { id: 160, windowId: W1, groupId: -1, url: "https://yarrlist.net/", title: "YARRLIST", active: true };
    fake.tabs.set(160, { ...tab, lastAccessed: Date.now() });
    await fake.chrome.scripting.executeScript({ target: { tabId: 160 } });
    await engine.onPageSnippet(asTab(tab), tab.url, "Watch free movies and tv shows online. Torrents and pirated downloads");
    expect(blocked()).toContain(160);
    expect(await engine.onContentReady(asTab(tab))).toMatchObject({ blocked: true });
    expect(await engine.onContentReady(asTab({ ...tab, id: 161 }))).toMatchObject({ blocked: true });
  });

  it("allowed pages are not reported as blocked", async () => {
    await engine.start();
    await engine.confirm(45);
    expect(await engine.onContentReady(asTab({ ...TABS[0]!, groupId: -1 }))).toEqual({ blocked: false });
  });
});

describe("after a session ends", () => {
  it("Start works right away, without clicking Done first", async () => {
    await engine.start();
    await engine.confirm(25);
    await engine.requestEnd("done");
    await engine.finishEnd();
    expect((await session.loadSession())!.state).toBe("ENDED");
    const ended = (await session.loadSession())!.id;
    await engine.start();
    const s = (await session.loadSession())!;
    expect(s.state).toBe("SWEEP_PREVIEW");
    expect(s.id).not.toBe(ended);
    expect(await engine.sessionHistoryMinutes()).toHaveLength(1); // the ended one is kept for the report
  });
});

describe("breaks (LOOP-08, Q-34)", () => {
  async function lockedIn() {
    await engine.start();
    await engine.confirm(45);
  }
  const later = (min: number) => {
    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now + min * 60_000);
  };

  it("are earned at 1 minute per 5 on task; none at the start", async () => {
    await lockedIn();
    expect(await engine.startBreak(5)).toBe(false);
    later(26); // 26 on-task minutes → 5 earned
    expect(await engine.startBreak(10)).toBe(false);
    expect(await engine.startBreak(5)).toBe(true);
    vi.restoreAllMocks();
    expect((await session.loadSession())!.state).toBe("ON_BREAK");
  });

  it("unlock everything, then re-lock and close what was opened meanwhile", async () => {
    await lockedIn();
    later(30);
    await engine.startBreak(5);
    expect(fake.rules()).toEqual([]); // pre-blocks lifted
    const tab = { id: 180, windowId: W1, groupId: -1, url: "https://www.netflix.com/title/5", title: "Netflix", active: true };
    fake.tabs.set(180, { ...tab, lastAccessed: Date.now() });
    await engine.onTabChanged(asTab(tab));
    expect(fake.removed).not.toContain(180); // allowed during the break
    later(36);
    await engine.endBreak();
    vi.restoreAllMocks();
    expect((await session.loadSession())!.state).toBe("ACTIVE");
    expect(fake.rules().length).toBeGreaterThan(0);
    expect(fake.removed).toContain(180);
  });

  it("INV-16: ending right after a break is not a bail, and break time doesn't count toward the goal", async () => {
    await lockedIn();
    later(30);
    await engine.startBreak(5);
    const s = (await session.loadSession())!;
    expect(engine.breakMs(s, s.breaks[0]!.startedAt + 5 * 60_000)).toBe(5 * 60_000);
    later(36);
    await engine.endBreak();
    vi.restoreAllMocks();
    // 45-minute goal; 36 minutes elapsed including a 5-minute break → not reached yet
    expect(await engine.stop()).toBe(false);
  });
});
