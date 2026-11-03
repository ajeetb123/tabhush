// The desktop session engine end to end against a fake macOS layer (Q-63..Q-70): Start names the
// task and proposes blocks across apps and browsers, Lock in closes and quits them, the tick tracks
// and enforces, and the ending rules hold (owner's dev build vs everyone else).
import { beforeEach, describe, expect, it } from "vitest";
import { writeFileSync } from "node:fs";
import { DESKTOP, MS } from "@tabhush/core";
import { ActivityLog } from "../src/main/activity";
import { appKind, isSchoolPage, looksLikeGame } from "../src/main/apps";
import { Categories } from "../src/main/categories";
import { Engine, passageMatches } from "../src/main/engine";
import { Judge } from "../src/main/judge";
import { JsonStore } from "../src/main/store";
import { activityTotals, appBreakdown } from "../src/renderer/reportData";
import { app, categoriesDir, chromeTab, CHROME, Clock, fakeEmbed, FakeSystem, FIREFOX, tempDir } from "./fakes";

const embed = async (t: string[]) => fakeEmbed(t);
const STEAM = app("Steam", "com.valvesoftware.steam");
const SPOTIFY = app("Spotify", "com.spotify.client", "public.app-category.music");
const VSCODE = app("Code", "com.microsoft.VSCode", "public.app-category.developer-tools");
const MESSAGES = app("Messages", "com.apple.MobileSMS", "public.app-category.social-networking");

let sys: FakeSystem;
let clock: Clock;
let store: JsonStore;
let opened: string[];
let relaunch: boolean[];
let activity: ActivityLog;

function make(dev = false): Engine {
  const categories = new Categories(categoriesDir());
  const judge = new Judge({ embed, categories, essentials: () => [], schoolSites: () => [], selfBundleId: "com.tabhush.app" });
  return new Engine({
    store,
    system: sys,
    judge,
    embed,
    activity: (activity = new ActivityLog(store)),
    categories,
    dev,
    selfBundleId: "com.tabhush.app",
    openWindow: (p) => void opened.push(p),
    onChange: () => undefined,
    setRelaunch: (on) => void relaunch.push(on),
    now: clock.now,
  });
}

beforeEach(() => {
  sys = new FakeSystem();
  clock = new Clock();
  store = new JsonStore(tempDir("tabhush-"));
  opened = [];
  relaunch = [];
  sys.openTabs = [
    { bundleId: CHROME.bundleId, url: "https://docs.google.com/document/d/1/edit", title: "CS 2114 Project 3 writeup" },
    { bundleId: CHROME.bundleId, url: "https://www.netflix.com/watch/1", title: "Netflix" },
    { bundleId: CHROME.bundleId, url: "https://canvas.instructure.com/courses/1", title: "Quiz 3" },
  ];
  sys.running = [CHROME, STEAM, SPOTIFY, VSCODE];
  sys.frontNow = chromeTab("https://docs.google.com/document/d/1/edit", "CS 2114 Project 3 writeup");
});

async function lockIn(e: Engine, goalMin = 45): Promise<void> {
  await e.start();
  await e.confirm(goalMin);
  expect(e.session!.state).toBe("ACTIVE");
}

describe("apps (DSK-10, Q-70)", () => {
  it("sorts apps into kinds", () => {
    expect(appKind(STEAM)).toBe("distraction");
    expect(appKind(app("Chess Royale", "x.y", "public.app-category.board-games"))).toBe("distraction");
    expect(appKind(app("Claude", "com.anthropic.claudefordesktop"))).toBe("tool");
    expect(appKind(VSCODE)).toBe("tool");
    expect(appKind(SPOTIFY)).toBe("music");
    expect(appKind(CHROME)).toBe("browser");
    expect(appKind(app("Finder", "com.apple.finder"))).toBe("system");
    expect(appKind(app("LockDown Browser", "com.respondus.x"))).toBe("proctoring");
    expect(appKind(app("Some Tool", "a.b"))).toBe("other");
  });

  it("knows Windows programs by their .exe name (Q-71)", () => {
    expect(appKind(app("Steam", "steam.exe"))).toBe("distraction");
    expect(appKind(app("Roblox", "robloxplayerbeta.exe"))).toBe("distraction");
    expect(appKind(app("Google Chrome", "chrome.exe"))).toBe("browser");
    expect(appKind(app("Visual Studio Code", "code.exe"))).toBe("tool");
    expect(appKind(app("Microsoft Word", "winword.exe"))).toBe("tool");
    expect(appKind(app("Spotify", "spotify.exe"))).toBe("music");
    expect(appKind(app("Windows Explorer", "explorer.exe"))).toBe("system");
    expect(appKind(app("Tabhush", "tabhush.exe"))).toBe("system");
  });
});

describe("Start and Lock in", () => {
  it("names the task from what's open and proposes Netflix and Steam, never Canvas", async () => {
    const e = make();
    await e.start();
    const s = e.session!;
    expect(s.state).toBe("SWEEP_PREVIEW");
    expect(s.taskLabel).toBe("CS 2114");
    expect(s.preview.map((p) => `${p.kind}:${p.label}`).sort()).toEqual(["app:Steam", "tab:netflix.com"]);
    expect(opened).toContain("session");
    expect(sys.closed).toEqual([]); // nothing closes before Lock in (LOOP-04)
  });

  it("Lock in closes the tabs, quits the apps, turns music down, and arms the relaunch guard", async () => {
    const e = make();
    await lockIn(e);
    expect(sys.closed).toEqual([{ bundleId: CHROME.bundleId, urls: ["https://www.netflix.com/watch/1"] }]);
    expect(sys.quits).toEqual([STEAM.bundleId]);
    expect(sys.volumes["com.spotify.client"]).toBe(30);
    expect(e.session!.restoreList.map((r) => r.reason).sort()).toEqual(["closed", "quit"]);
    expect(relaunch[relaunch.length - 1]).toBe(true);
    expect(e.quitBlocked()).toBe(true);
  });

  it("an unticked item stays open", async () => {
    const e = make();
    await e.start();
    await e.toggle("app:com.valvesoftware.steam", false);
    await e.confirm(45);
    expect(sys.quits).toEqual([]);
  });
});

describe("the tick: tracking and blocking", () => {
  it("a distraction app opened again is quit once, then hidden if it ignores the quit", async () => {
    const e = make();
    await lockIn(e);
    sys.quits = [];
    sys.frontNow = { app: { ...STEAM, pid: 2 }, title: "Steam" };
    await e.tick();
    expect(sys.quits).toEqual([STEAM.bundleId]);
    const blocks = e.session!.blockEvents.length;
    clock.advance(2 * MS.SECOND);
    await e.tick();
    expect(sys.quits).toHaveLength(1); // not again within REHIDE_AFTER_QUIT_SEC
    clock.advance(DESKTOP.REHIDE_AFTER_QUIT_SEC * MS.SECOND);
    await e.tick();
    expect(sys.hides).toEqual([STEAM.bundleId]);
    expect(e.session!.blockEvents.length).toBe(blocks); // one block, one event
  });

  it("a blocked page in a browser is closed; work pages are on task", async () => {
    const e = make();
    await lockIn(e);
    sys.closed = [];
    sys.frontNow = chromeTab("https://www.netflix.com/browse", "Netflix");
    await e.tick();
    expect(sys.closed).toEqual([{ bundleId: CHROME.bundleId, urls: ["https://www.netflix.com/browse"] }]);
    sys.frontNow = chromeTab("https://docs.google.com/document/d/1/edit", "CS 2114 Project 3 writeup");
    clock.advance(MS.SECOND);
    await e.tick();
    const last = e.session!.focusLog[e.session!.focusLog.length - 1]!;
    expect(last).toMatchObject({ state: "on", domain: "docs.google.com", title: "CS 2114 Project 3 writeup" });
  });

  it("Firefox: no URL, so a title naming a blocked site closes the front tab", async () => {
    const e = make();
    await lockIn(e);
    sys.frontNow = { app: FIREFOX, title: "Netflix — Mozilla Firefox" };
    await e.tick();
    expect(sys.frontClosed).toEqual([`${FIREFOX.bundleId}|Netflix — Mozilla Firefox`]);
  });

  it("logs the day for the report; excluded apps keep their name only", async () => {
    const e = make();
    const ticks = async (n: number) => {
      for (let i = 0; i < n; i++) {
        await e.tick();
        clock.advance(MS.SECOND);
      }
    };
    sys.frontNow = { app: VSCODE, title: "engine.ts — tabhush" };
    await ticks(12);
    sys.frontNow = { app: MESSAGES, title: "Mom" };
    await ticks(6);
    activity.flush(clock.t);
    const all = new ActivityLog(store).between(clock.t - MS.HOUR, clock.t + 1); // read back from disk
    const apps = appBreakdown(all, clock.t - MS.HOUR, clock.t + 1);
    expect(apps.map((a) => a.app)).toEqual(["Code", "Messages"]);
    expect(apps[0]!.groups[0]!.titles[0]).toEqual({ title: "engine.ts — tabhush", ms: 11 * MS.SECOND });
    expect(apps[1]!.groups[0]!.titles).toEqual([]); // DSK-30: no titles from Messages
    expect(activityTotals(all, clock.t - MS.HOUR, clock.t + 1).activeMs).toBe(17 * MS.SECOND);
  });

  it("a proctoring app suspends blocking while it runs (DSK-10)", async () => {
    const e = make();
    await lockIn(e);
    const lockdown = app("LockDown Browser", "com.respondus.lockdownbrowser");
    sys.running.push(lockdown);
    sys.frontNow = { app: lockdown, title: "Exam" };
    await e.tick();
    expect(e.session!.suspendedFor).toBe("LockDown Browser");
    sys.quits = [];
    sys.frontNow = { app: STEAM, title: "Steam" };
    await e.tick();
    expect(sys.quits).toEqual([]);
  });
});

describe("other productive work (Q-72)", () => {
  const resume = chromeTab("https://docs.google.com/document/d/9/edit", "Resume tailoring draft");

  it("work for another of your tasks is logged as other work for that task, not off task", async () => {
    const e = make();
    await lockIn(e);
    expect(await e.addOtherTask("Resume tailoring")).toBe(true);
    sys.frontNow = resume;
    clock.advance(MS.SECOND);
    await e.tick();
    expect(e.session!.focusLog[e.session!.focusLog.length - 1]).toMatchObject({ state: "other", task: "Resume tailoring", domain: "docs.google.com" });
    expect(sys.closed.filter((c) => c.urls[0]?.includes("/d/9/"))).toEqual([]); // never blocked
    sys.frontNow = chromeTab("https://docs.google.com/document/d/1/edit", "CS 2114 Project 3 writeup");
    clock.advance(MS.SECOND);
    await e.tick();
    expect(e.session!.focusLog[e.session!.focusLog.length - 1]!.state).toBe("on");
  });

  it("a task from an earlier session is recognized without naming it again", async () => {
    const first = make(true);
    await first.start();
    await first.setTasks(["Resume tailoring"]);
    await first.confirm(25);
    await first.requestEnd("done");
    const e = make();
    await lockIn(e);
    sys.frontNow = resume;
    await e.tick();
    expect(e.session!.focusLog[e.session!.focusLog.length - 1]).toMatchObject({ state: "other", task: "Resume tailoring" });
  });

  it("switched off in settings, it all counts as this session's task", async () => {
    const e = make();
    e.setSettings({ countOtherWork: false });
    await lockIn(e);
    await e.addOtherTask("Resume tailoring");
    sys.frontNow = resume;
    await e.tick();
    expect(e.session!.focusLog[e.session!.focusLog.length - 1]!.state).toBe("on");
  });
});

describe("ending rules (Q-69, Q-70)", () => {
  it("someone else's install can't End or quit before the goal", async () => {
    const e = make(false);
    await lockIn(e);
    expect(await e.requestEnd("bored")).toBe(false);
    expect(e.endAccess().canEnd).toBe(false);
    expect(e.quitBlocked()).toBe(true);
  });

  it("the owner's development build ends at once and may quit", async () => {
    const e = make(true);
    await lockIn(e);
    expect(e.quitBlocked()).toBe(false);
    expect(await e.requestEnd("testing")).toBe(true);
    expect(e.session!.state).toBe("ENDED");
    expect(e.session!.endKind).toBe("early");
    expect(sys.volumes["com.spotify.client"]).toBe(80); // music volume restored
  });

  it("past the goal, Stop ends at once as a normal end", async () => {
    const e = make();
    await lockIn(e, 25);
    clock.advance(26 * MS.MINUTE);
    expect(await e.stop()).toBe(true);
    expect(e.session!.endKind).toBe("normal");
    expect(e.pastSessions()).toHaveLength(1);
    expect(relaunch[relaunch.length - 1]).toBe(false);
  });

  it("Emergency stop: needs a reason and the passage retyped, then 60 s with blocks on, once a day", async () => {
    const e = make();
    await lockIn(e);
    expect(await e.emergencyStop("family", "I am choosing")).toBe(false);
    expect(await e.emergencyStop("", DESKTOP.EMERGENCY_PASSAGE)).toBe(false);
    expect(await e.emergencyStop("family", DESKTOP.EMERGENCY_PASSAGE.replace("'", "’"))).toBe(true);
    expect(e.session!.state).toBe("END_COUNTDOWN");
    sys.quits = [];
    sys.frontNow = { app: { ...STEAM, pid: 2 }, title: "Steam" };
    clock.advance(30 * MS.SECOND);
    await e.tick();
    expect(sys.quits).toEqual([STEAM.bundleId]); // still enforcing
    clock.advance(31 * MS.SECOND);
    await e.tick();
    expect(e.session!.endKind).toBe("emergency");
    expect(e.emergencyStopsLeft()).toBe(0);
    await lockIn(e);
    expect(await e.emergencyStop("again", DESKTOP.EMERGENCY_PASSAGE)).toBe(false);
  });

  it("the passage check forgives spacing and curly quotes only", () => {
    expect(passageMatches(`  ${DESKTOP.EMERGENCY_PASSAGE.replace(/ /g, "  ")} `)).toBe(true);
    expect(passageMatches(DESKTOP.EMERGENCY_PASSAGE.toLowerCase())).toBe(false);
  });
});

describe("Step away, idle and gaps", () => {
  it("Step away stops the clock and keeps blocking; I'm back resumes", async () => {
    const e = make();
    await lockIn(e, 45);
    clock.advance(20 * MS.MINUTE);
    expect(await e.stepAway()).toBe(true);
    sys.quits = [];
    sys.frontNow = { app: { ...STEAM, pid: 2 }, title: "Steam" };
    await e.tick();
    expect(sys.quits).toEqual([STEAM.bundleId]);
    clock.advance(30 * MS.MINUTE);
    expect(await e.resume()).toBe(true);
    clock.advance(20 * MS.MINUTE);
    expect(await e.stop()).toBe(false); // 40 of 45 minutes worked
    clock.advance(6 * MS.MINUTE);
    expect(await e.stop()).toBe(true);
  });

  it("no input for 30 minutes pauses, backdated; input again resumes", async () => {
    const e = make();
    await lockIn(e);
    sys.idle = 30 * 60;
    clock.advance(31 * MS.MINUTE);
    await e.tick();
    expect(e.session!.state).toBe("IDLE_PAUSED");
    expect(e.session!.pauses[0]!.startedAt).toBe(clock.t - 30 * MS.MINUTE);
    sys.idle = 0;
    clock.advance(MS.SECOND);
    await e.tick();
    expect(e.session!.state).toBe("ACTIVE");
  });

  it("two hours paused ends the session", async () => {
    const e = make();
    await lockIn(e);
    await e.stepAway();
    clock.advance(SESSION_END_MS);
    await e.tick();
    expect(e.session!.state).toBe("ENDED");
    expect(e.session!.endKind).toBe("idle");
  });

  it("an app that was killed and relaunched logs a gap, and the gap doesn't count toward the goal", async () => {
    const e = make();
    await lockIn(e, 45);
    clock.advance(10 * MS.MINUTE);
    await e.tick();
    clock.advance(40 * MS.MINUTE); // not running
    const again = make();
    expect(again.session!.gaps).toHaveLength(1);
    expect(again.session!.state).toBe("ACTIVE");
    expect(await again.stop()).toBe(false);
  });
});

const SESSION_END_MS = 2 * MS.HOUR + MS.MINUTE;
describe("startup (regression)", () => {
  it("a session saved by an earlier run loads without touching the UI during construction", async () => {
    const first = make(true);
    await lockIn(first);
    clock.advance(10 * MS.MINUTE); // the app was not running for a while: a gap is logged
    let changes = 0;
    const categories = new Categories(categoriesDir());
    const again = new Engine({
      store, system: sys, embed, activity: new ActivityLog(store), categories, dev: false, selfBundleId: "com.tabhush.app",
      judge: new Judge({ embed, categories, essentials: () => [], schoolSites: () => [], selfBundleId: "com.tabhush.app" }),
      openWindow: () => undefined, onChange: () => void changes++, setRelaunch: () => undefined, now: clock.now,
    });
    expect(again.session!.gaps).toHaveLength(1);
    expect(changes).toBe(0);
  });
});

describe("recognizing by looking (Q-74)", () => {
  it("a game is known by where it's installed or what it's built with, not its name", () => {
    expect(looksLikeGame("/Users/a/Library/Application Support/Steam/steamapps/common/dota 2 beta/game/dota.app")).toBe(true);
    expect(looksLikeGame("C:\\Program Files\\Epic Games\\Fortnite\\FortniteGame\\Binaries\\Win64\\FortniteClient-Win64-Shipping.exe")).toBe(true);
    const files = new Set(["/Applications/Some Indie Game.app/Contents/Frameworks/UnityPlayer.dylib"]);
    expect(looksLikeGame("/Applications/Some Indie Game.app", (p) => files.has(p))).toBe(true);
    expect(looksLikeGame("/Applications/Visual Studio Code.app", () => false)).toBe(false);
    expect(looksLikeGame("C:\\Program Files\\Microsoft VS Code\\Code.exe", () => false)).toBe(false);
  });

  it("school pages are known by address or site name", () => {
    expect(isSchoolPage("canvas.vt.edu", "Dashboard")).toBe(true);
    expect(isSchoolPage("moodle.ox.ac.uk", "Course home")).toBe(true);
    expect(isSchoolPage("us.prairielearn.com", "Homework 3 | PrairieLearn")).toBe(true);
    expect(isSchoolPage("developer.mozilla.org", "HTML canvas tutorial - MDN")).toBe(false);
    expect(isSchoolPage("netflix.com", "Netflix")).toBe(false);
  });

  it("Dota 2 is quit even though no list names it", async () => {
    const e = make();
    await lockIn(e);
    const dota = { ...app("Dota 2", "com.valvesoftware.dota2"), path: "/Users/a/Library/Application Support/Steam/steamapps/common/dota 2 beta/game/dota.app" };
    sys.frontNow = { app: dota, title: "Dota 2" };
    await e.tick();
    expect(sys.quits).toContain("com.valvesoftware.dota2");
  });

  it("a school page from a site no list knows is never blocked", async () => {
    const e = make();
    await lockIn(e);
    sys.closed = [];
    sys.frontNow = chromeTab("https://canvas.vt.edu/courses/12/assignments", "Assignments");
    await e.tick();
    expect(sys.closed).toEqual([]);
  });

  it("one task per session: picking another replaces it", async () => {
    const e = make();
    await e.start();
    await e.setTasks(["CS 2114", "Resume tailoring"]);
    expect(e.session!.taskIds).toHaveLength(1);
    expect(e.session!.taskLabel).toBe("Resume tailoring");
  });

  it("sitting there doing nothing doesn't count: idle minutes come back out of the log", async () => {
    const e = make();
    sys.frontNow = { app: VSCODE, title: "engine.ts" };
    for (let i = 0; i < 600; i++) {
      sys.idle = i >= 300 ? i - 300 : 0; // input stops after 5 minutes
      await e.tick();
      clock.advance(MS.SECOND);
    }
    activity.flush(clock.t);
    const t = activityTotals(new ActivityLog(store).between(clock.t - MS.HOUR, clock.t + 1), clock.t - MS.HOUR, clock.t + 1);
    expect(Math.round(t.activeMs / MS.SECOND)).toBe(300); // the 3 no-input minutes before it was noticed are away too
  });

  it("a distracting tab playing behind your work is closed by the background check", async () => {
    const e = make();
    await lockIn(e);
    sys.closed = [];
    sys.openTabs.push({ bundleId: CHROME.bundleId, url: "https://www.netflix.com/watch/77", title: "Netflix" });
    clock.advance(DESKTOP.BACKGROUND_SWEEP_SEC * MS.SECOND);
    await e.tick();
    expect(sys.closed.flatMap((c) => c.urls)).toContain("https://www.netflix.com/watch/77");
  });
});

describe("edge cases", () => {
  it("nothing open at Start: no task, and Lock in does nothing until one is typed", async () => {
    sys.openTabs = [];
    sys.running = [];
    sys.frontNow = { app: null, title: "" };
    const e = make();
    await e.start();
    expect(e.session!.taskLabel).toBeNull();
    await e.confirm(45);
    expect(e.session!.state).toBe("SWEEP_PREVIEW");
    await e.setTasks(["   "]);
    expect(e.session!.taskIds).toEqual([]);
    await e.setTasks(["Chem lab"]);
    await e.confirm(45);
    expect(e.session!.state).toBe("ACTIVE");
  });

  it("two Starts at once make one session", async () => {
    const e = make();
    await Promise.all([e.start(), e.start()]);
    const id = e.session!.id;
    await e.start();
    expect(e.session!.id).toBe(id);
  });

  it("a corrupted save file starts clean instead of crashing", () => {
    writeFileSync(store.path("session"), "{ not json");
    writeFileSync(store.path("tasks"), "garbage");
    const e = make();
    expect(e.session).toBeNull();
    expect(e.endAccess().canEnd).toBe(false);
  });

  it("relaunched during the end countdown: the countdown still finishes", async () => {
    const e = make();
    await lockIn(e, 25);
    clock.advance(26 * MS.MINUTE);
    await e.requestEnd("done");
    clock.advance(10 * MS.MINUTE); // app was closed past the countdown
    const again = make();
    await again.tick();
    expect(again.session!.state).toBe("ENDED");
  });

  it("relaunched after a break ran out: back to work, and what was opened during it is closed", async () => {
    const e = make();
    await lockIn(e);
    await e.tick(); // the app ticks every second; focused time needs a front item
    clock.advance(30 * MS.MINUTE);
    expect(await e.startBreak(5)).toBe(true);
    sys.openTabs.push({ bundleId: CHROME.bundleId, url: "https://www.netflix.com/title/9", title: "Netflix" });
    clock.advance(20 * MS.MINUTE);
    const again = make();
    sys.closed = [];
    await again.tick();
    expect(again.session!.state).toBe("ACTIVE");
    expect(sys.closed.flatMap((c) => c.urls)).toContain("https://www.netflix.com/title/9");
  });

  it("settings are locked during a session and open again after it", async () => {
    const e = make(true);
    await lockIn(e);
    expect(() => e.setSettings({ trackAllDay: false })).toThrow(/locked/);
    await e.requestEnd("done");
    expect(e.setSettings({ trackAllDay: false }).trackAllDay).toBe(false);
  });

  it("blocking comes back once the proctoring app closes", async () => {
    const e = make();
    await lockIn(e);
    const lockdown = app("LockDown Browser", "com.respondus.lockdownbrowser");
    sys.running.push(lockdown);
    sys.frontNow = { app: lockdown, title: "Exam" };
    await e.tick();
    sys.running = sys.running.filter((a) => a !== lockdown);
    sys.quits = [];
    sys.frontNow = { app: { ...STEAM, pid: 3 }, title: "Steam" };
    clock.advance(MS.SECOND);
    await e.tick();
    expect(e.session!.suspendedFor).toBeNull();
    expect(sys.quits).toContain(STEAM.bundleId);
  });

  it("the once-a-day emergency stop is available again after 4am the next day", async () => {
    const e = make();
    await lockIn(e);
    await e.emergencyStop("family", DESKTOP.EMERGENCY_PASSAGE);
    clock.advance(61 * MS.SECOND);
    await e.tick();
    expect(e.emergencyStopsLeft()).toBe(0);
    clock.advance(15 * MS.HOUR); // 2pm + 15h = 5am next day
    expect(e.emergencyStopsLeft()).toBe(1);
  });

  it("popups and notification banners in front don't count as switching away", async () => {
    const e = make();
    await lockIn(e);
    const before = e.session!.focusLog.length;
    sys.frontNow = { app: { ...app("UserNotificationCenter", "com.apple.UserNotificationCenter"), regular: false }, title: "" };
    clock.advance(MS.SECOND);
    await e.tick();
    expect(e.session!.focusLog.length).toBe(before);
    expect(sys.quits.filter((q) => q === "com.apple.UserNotificationCenter")).toEqual([]);
  });

  it("looking at Tabhush itself doesn't add a row or count as work on something else", async () => {
    const e = make();
    await lockIn(e);
    const last = e.session!.focusLog[e.session!.focusLog.length - 1];
    sys.frontNow = { app: app("Tabhush", "com.tabhush.app"), title: "Tabhush" };
    clock.advance(MS.SECOND);
    await e.tick();
    expect(e.session!.focusLog[e.session!.focusLog.length - 1]).toEqual(last);
  });

  it("browser control denied (macOS Automation): the blocked tab is still closed with Cmd+W", async () => {
    const e = make();
    await lockIn(e);
    sys.automationDenied = true;
    sys.frontNow = chromeTab("https://www.netflix.com/browse", "Netflix");
    await e.tick();
    expect(sys.frontClosed).toEqual([`${CHROME.bundleId}|Netflix - Google Chrome`]);
  });

  it("browser pages (new tab, settings, blank) are never blocked", async () => {
    const e = make();
    await lockIn(e);
    sys.closed = [];
    for (const url of ["chrome://newtab/", "about:blank", "chrome://settings/"]) {
      sys.frontNow = chromeTab(url, "New Tab");
      clock.advance(MS.SECOND);
      await e.tick();
    }
    expect(sys.closed).toEqual([]);
  });

  it("very long titles are cut for the report", async () => {
    const e = make();
    sys.frontNow = { app: VSCODE, title: "x".repeat(500) };
    await e.tick();
    expect(e.describe(await sys.front())!.title!.length).toBe(DESKTOP.APP_TITLE_MAX_CHARS);
  });

  it("with all-day tracking off, only session time is logged", async () => {
    const e = make();
    e.setSettings({ trackAllDay: false });
    sys.frontNow = { app: VSCODE, title: "before" };
    for (let i = 0; i < 5; i++) {
      await e.tick();
      clock.advance(MS.SECOND);
    }
    activity.flush(clock.t);
    expect(new ActivityLog(store).between(clock.t - MS.HOUR, clock.t + 1)).toEqual([]);
    await lockIn(e);
    for (let i = 0; i < 5; i++) {
      await e.tick();
      clock.advance(MS.SECOND);
    }
    activity.flush(clock.t);
    expect(new ActivityLog(store).between(clock.t - MS.HOUR, clock.t + 1).length).toBeGreaterThan(0);
  });

  it("idle that started before 4am is taken out of both days' logs", () => {
    const log = new ActivityLog(store);
    const t4 = new Date(2026, 10, 3, 4, 0, 0).getTime();
    const seg = { state: "active" as const, label: "Code", app: "Code", bundleId: "com.microsoft.VSCode", title: "x" };
    for (let t = t4 - 5 * MS.MINUTE; t <= t4 + 5 * MS.MINUTE; t += MS.SECOND) log.record(t, seg);
    log.markAwaySince(t4 - 3 * MS.MINUTE, t4 + 5 * MS.MINUTE);
    log.flush(t4 + 5 * MS.MINUTE);
    const all = new ActivityLog(store).between(t4 - MS.HOUR, t4 + MS.HOUR);
    expect(Math.round(activityTotals(all, t4 - MS.HOUR, t4 + MS.HOUR).activeMs / MS.MINUTE)).toBe(2);
  });

  it("Stop during a break past the goal ends normally and closes the break", async () => {
    const e = make();
    await lockIn(e, 25);
    await e.tick();
    clock.advance(30 * MS.MINUTE);
    expect(await e.startBreak(5)).toBe(true);
    clock.advance(MS.MINUTE);
    expect(await e.stop()).toBe(true);
    expect(e.session!.endKind).toBe("normal");
    expect(e.session!.breaks[0]!.endedAt).not.toBeNull();
  });

  it("an emergency stop works from a pause, and the pause is closed", async () => {
    const e = make();
    await lockIn(e);
    await e.stepAway();
    expect(await e.emergencyStop("ER visit", DESKTOP.EMERGENCY_PASSAGE)).toBe(true);
    expect(e.session!.pauses[0]!.endedAt).not.toBeNull();
  });
});
