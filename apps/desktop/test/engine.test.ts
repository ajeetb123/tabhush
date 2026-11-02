// The desktop session engine end to end against a fake macOS layer (Q-63..Q-70): Start names the
// task and proposes blocks across apps and browsers, Lock in closes and quits them, the tick tracks
// and enforces, and the ending rules hold (owner's dev build vs everyone else).
import { beforeEach, describe, expect, it } from "vitest";
import { DESKTOP, MS } from "@lockin/core";
import { ActivityLog } from "../src/main/activity";
import { appKind } from "../src/main/apps";
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
    sys.frontNow = { app: VSCODE, title: "engine.ts — lockin" };
    await ticks(12);
    sys.frontNow = { app: MESSAGES, title: "Mom" };
    await ticks(6);
    activity.flush(clock.t);
    const all = new ActivityLog(store).between(clock.t - MS.HOUR, clock.t + 1); // read back from disk
    const apps = appBreakdown(all, clock.t - MS.HOUR, clock.t + 1);
    expect(apps.map((a) => a.app)).toEqual(["Code", "Messages"]);
    expect(apps[0]!.groups[0]!.titles[0]).toEqual({ title: "engine.ts — lockin", ms: 11 * MS.SECOND });
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