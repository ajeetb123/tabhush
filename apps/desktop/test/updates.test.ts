// Updates (Q-75) never install during a session (INV-14), and the user is told once.
import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";

const fake = Object.assign(new EventEmitter(), {
  setFeedURL: vi.fn(),
  checkForUpdates: vi.fn(async () => undefined),
  quitAndInstall: vi.fn(),
  autoDownload: false,
  autoInstallOnAppQuit: true,
  logger: null as unknown,
});
vi.mock("electron-updater", () => ({ default: { autoUpdater: fake } }));

const { Updates } = await import("../src/main/updates");

describe("Updates", () => {
  let inSession: boolean;
  let notes: string[];
  const make = (enabled = true) =>
    new Updates({ enabled, canInstallNow: () => !inSession, onChange: () => undefined, notify: (t) => void notes.push(t), log: () => undefined });

  beforeEach(() => {
    inSession = false;
    notes = [];
    fake.removeAllListeners();
    fake.quitAndInstall.mockClear();
    vi.useFakeTimers();
  });

  it("off (macOS, dev builds): nothing is checked", () => {
    const u = make(false);
    u.start();
    expect(u.status.state).toBe("off");
    expect(u.installNow()).toBe(false);
  });

  it("checks the public releases feed, never installs on quit by itself", () => {
    make().start();
    expect(fake.setFeedURL).toHaveBeenCalledWith(expect.objectContaining({ provider: "github", repo: "tabhush-releases" }));
    expect(fake.autoInstallOnAppQuit).toBe(false);
  });

  it("an update that arrives mid-session waits, then is offered once the session ends", () => {
    const u = make();
    u.start();
    inSession = true;
    fake.emit("update-downloaded", { version: "0.1.2" });
    expect(u.status).toEqual({ state: "ready", version: "0.1.2" });
    expect(notes).toEqual([]);
    expect(u.installNow()).toBe(false);
    vi.runAllTicks();
    expect(fake.quitAndInstall).not.toHaveBeenCalled();
    inSession = false;
    u.offer();
    u.offer();
    expect(notes).toHaveLength(1);
    expect(u.installNow()).toBe(true);
  });

  it("a failed check is logged and a ready update stays ready", () => {
    const u = make();
    u.start();
    fake.emit("update-downloaded", { version: "0.1.2" });
    fake.emit("error", new Error("offline"));
    expect(u.status.state).toBe("ready");
  });
});
