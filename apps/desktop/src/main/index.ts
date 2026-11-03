// Tabhush desktop app (Q-70): a menu-bar app that runs in the background. It tracks what's in
// front for the report, and during a session blocks distractions in every app and browser.
//
// Windows: one main window (session, report, settings pages) and one hidden window that runs the
// bundled classifier model (the extension's offscreen document, DSK-01). Pages are served from
// app://tabhush/ so they can fetch the bundled model files.

import { app, BrowserWindow, ipcMain, Menu, nativeImage, net, Notification, powerMonitor, powerSaveBlocker, protocol, shell, Tray } from "electron";
import { execFile } from "node:child_process";
import { appendFile, existsSync } from "node:fs";
import { dirname, join, normalize, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { BRAND, DESKTOP, EMBEDDING, MS, OWNER_RULES, EXITS, goalReached } from "@tabhush/core";
import type { UiMessage } from "../shared/types";
import { offClockMs } from "../renderer/reportData";
import { ActivityLog } from "./activity";
import { Categories } from "./categories";
import { Engine } from "./engine";
import { Judge } from "./judge";
import { JsonStore } from "./store";
import { HelperSystem } from "./system";
import { Updates } from "./updates";

const here = dirname(fileURLToPath(import.meta.url)); // dist/
const RENDERER = join(here, "renderer");
const DEV = !app.isPackaged;
const IS_WIN = process.platform === "win32";
const SELF_BUNDLE_ID = IS_WIN ? (DEV ? "electron.exe" : "tabhush.exe") : DEV ? "com.github.Electron" : "com.tabhush.app";

/** The OS layer: the Swift helper on macOS, a PowerShell script on Windows (Q-71). */
function helperCommand(): { binary: string; args: string[] } {
  if (IS_WIN) {
    const script = DEV ? join(here, "..", "native", "helper-win.ps1") : join(process.resourcesPath, "tabhush-helper.ps1");
    const args = ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", script];
    // The relaunch guard reopens Tabhush.exe if it is killed mid-session (packaged builds only).
    return { binary: "powershell.exe", args: DEV ? args : [...args, "-App", process.execPath] };
  }
  const binary = DEV ? join(here, "..", "build", "tabhush-helper") : join(process.resourcesPath, "tabhush-helper");
  // …/Tabhush.app/Contents/MacOS/Tabhush → …/Tabhush.app (for the relaunch guard).
  return { binary, args: DEV ? [] : ["--app", resolve(process.execPath, "..", "..", "..")] };
}

protocol.registerSchemesAsPrivileged([{ scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }]);

if (!app.requestSingleInstanceLock()) app.quit();

let main: BrowserWindow | null = null;
let embedder: BrowserWindow | null = null;
let tray: Tray | null = null;
let engine: Engine;
let system: HelperSystem;
let allowQuit = false;
let appNapBlock: number | null = null;
let updates: Updates | null = null;

const pageUrl = (page: string) => `app://tabhush/${page}.html`;

function showWindow(page: "session" | "report" | "settings" = "session"): void {
  if (!main || main.isDestroyed()) {
    main = new BrowserWindow({
      width: 820,
      height: 860,
      minWidth: 420,
      minHeight: 560,
      title: BRAND.NAME,
      backgroundColor: "#f5f3ef",
      show: false,
      webPreferences: { preload: join(here, "preload.cjs"), contextIsolation: true, sandbox: true },
    });
    main.on("close", (e) => {
      // Closing the window keeps the app running in the menu bar.
      if (!allowQuit) {
        e.preventDefault();
        main?.hide();
      }
    });
    main.once("ready-to-show", () => main?.show());
    main.on("session-end", allowSessionEnd);
    void main.loadURL(pageUrl(page));
  } else {
    const current = main.webContents.getURL();
    if (!current.endsWith(`/${page}.html`)) void main.loadURL(pageUrl(page));
    main.show();
  }
  main.focus();
  app.focus({ steal: true });
}

// ───────────────────────── classifier window (tier 2, CLS-20) ─────────────────────────

let embedReady: Promise<void> | null = null;
let embedSeq = 1;
const embedWaiting = new Map<number, { resolve: (v: number[][]) => void; reject: (e: Error) => void }>();

function ensureEmbedder(): Promise<void> {
  if (embedReady && embedder && !embedder.isDestroyed()) return embedReady;
  embedder = new BrowserWindow({
    show: false,
    webPreferences: { preload: join(here, "preload.cjs"), contextIsolation: true, sandbox: true, backgroundThrottling: false },
  });
  embedReady = embedder.loadURL(pageUrl("embedder"));
  embedder.on("session-end", allowSessionEnd); // Windows shutdown or sign-out
  embedder.on("closed", () => {
    embedReady = null;
    for (const w of embedWaiting.values()) w.reject(new Error("classifier window closed"));
    embedWaiting.clear();
  });
  return embedReady;
}

ipcMain.on("embed:reply", (_e, r: { id: number; ok: boolean; vectors?: number[][]; error?: string }) => {
  const w = embedWaiting.get(r.id);
  embedWaiting.delete(r.id);
  if (!w) return;
  if (r.ok && r.vectors) w.resolve(r.vectors);
  else w.reject(new Error(r.error ?? "embedding failed"));
});

/** Embeds texts in batches of 16 (EMBEDDING.START_BATCH_SIZE). Throws if tier 2 is unavailable. */
async function embed(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  await ensureEmbedder();
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += EMBEDDING.START_BATCH_SIZE) {
    const id = embedSeq++;
    const batch = texts.slice(i, i + EMBEDDING.START_BATCH_SIZE);
    out.push(
      ...(await new Promise<number[][]>((resolvePromise, reject) => {
        embedWaiting.set(id, { resolve: resolvePromise, reject });
        embedder!.webContents.send("embed", { id, texts: batch });
        setTimeout(() => {
          if (embedWaiting.delete(id)) reject(new Error("embedding timed out"));
        }, 30_000);
      })),
    );
  }
  return out;
}

// ───────────────────────── menu bar (DSK-30 pill) ─────────────────────────

function clock(ms: number): string {
  const sec = Math.max(0, Math.round(ms / MS.SECOND));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}

function trayTitle(): string {
  const s = engine.session;
  const now = Date.now();
  if (!s || s.committedAt === null || s.state === "ENDED") return "";
  if (s.state === "END_COUNTDOWN" && s.endCountdown) {
    const sec = s.emergency ? OWNER_RULES.EMERGENCY_COUNTDOWN_SEC : EXITS.END_COUNTDOWN_SEC;
    return ` ending ${clock(s.endCountdown.startedAt + sec * MS.SECOND - now)}`;
  }
  if (s.state === "ON_BREAK") {
    const b = s.breaks[s.breaks.length - 1]!;
    return ` break ${clock(b.startedAt + b.plannedMin * MS.MINUTE - now)}`;
  }
  if (s.state === "IDLE_PAUSED") return " paused";
  const worked = now - s.committedAt - offClockMs(s, now);
  if (s.goalMin && !goalReached(s.committedAt, s.goalMin, now, offClockMs(s, now))) return ` ${clock(s.goalMin * MS.MINUTE - worked)}`;
  return ` ${clock(worked)}`;
}

function rebuildMenu(): void {
  if (!tray) return;
  const s = engine.session;
  const running = !!s && s.state !== "IDLE" && s.state !== "ENDED";
  const locked = engine.quitBlocked();
  const items: Electron.MenuItemConstructorOptions[] = [
    running
      ? { label: s!.taskLabel ? `Locked in: ${s!.taskLabel}` : "Session running", click: () => showWindow("session") }
      : { label: "Start a session", click: () => void engine.start() },
    { label: `Open ${BRAND.NAME}`, click: () => showWindow("session") },
    { label: "Report", click: () => showWindow("report") },
    { type: "separator" },
    ...(s?.state === "ACTIVE" ? [{ label: "Step away", click: () => void engine.stepAway() }] : []),
    ...(s?.state === "IDLE_PAUSED" ? [{ label: "I’m back", click: () => void engine.resume() }] : []),
    ...(updates?.status.state === "ready" && !running
      ? [{ label: `Restart to update (${updates.status.version})`, click: () => void updates?.installNow() }]
      : []),
    { label: "Settings", click: () => showWindow("settings") },
    { type: "separator" },
    locked
      ? { label: "Can’t quit during a session", enabled: false }
      : { label: `Quit ${BRAND.NAME}`, click: () => quitNow() },
  ];
  tray.setContextMenu(Menu.buildFromTemplate(items));
}

/** Shutting down or signing out always works; the session resumes at the next login. */
function allowSessionEnd(): void {
  allowQuit = true;
  system?.setRelaunchFlag(false);
}

function quitNow(): void {
  allowQuit = true;
  system.setRelaunchFlag(false);
  app.quit();
}

function broadcast(): void {
  if (!engine) return; // the engine announces changes while it is still being created
  updates?.offer(); // an update that waited for the session to end is offered now
  for (const w of BrowserWindow.getAllWindows()) if (w !== embedder && !w.isDestroyed()) w.webContents.send("changed");
  rebuildMenu();
  // DSK-01: no App Nap while a session runs, so tracking and the classifier keep their pace.
  const running = !!engine.session && engine.session.committedAt !== null && engine.session.state !== "ENDED";
  if (running && appNapBlock === null) appNapBlock = powerSaveBlocker.start("prevent-app-suspension");
  if (!running && appNapBlock !== null) {
    powerSaveBlocker.stop(appNapBlock);
    appNapBlock = null;
  }
}

// ───────────────────────── messages from the pages ─────────────────────────

async function route(m: UiMessage): Promise<unknown> {
  switch (m.type) {
    case "get":
      return { ...(await engine.snapshot()), platform: process.platform, helperError: system.lastError, update: updates?.status, appVersion: app.getVersion() };
    case "installUpdate":
      return updates?.installNow() ?? false;
    case "start":
      return engine.start();
    case "setTasks":
      return engine.setTasks(m.labels);
    case "toggle":
      return engine.toggle(m.id, m.park);
    case "confirm":
      return engine.confirm(m.goalMin);
    case "stop":
      return engine.stop();
    case "end":
      return engine.requestEnd(m.reason);
    case "emergency":
      return engine.emergencyStop(m.reason, m.typed);
    case "stepAway":
      return engine.stepAway();
    case "resume":
      return engine.resume();
    case "break":
      return engine.startBreak(m.min);
    case "breakEnd":
      return engine.endBreak();
    case "dismiss":
      return engine.dismiss();
    case "addOther":
      return engine.addOtherTask(m.label);
    case "settings": {
      const next = engine.setSettings(m.patch);
      if (!DEV) app.setLoginItemSettings({ openAtLogin: next.openAtLogin });
      return next;
    }
    case "sessions":
      return engine.pastSessions();
    case "activity":
      return activity.between(m.from, m.to);
    case "requestAccessibility":
      return system.accessibilityTrusted(true);
    case "openPrivacyPane":
      if (IS_WIN) return null;
      return shell.openExternal(`x-apple.systempreferences:com.apple.preference.security?Privacy_${m.pane === "accessibility" ? "Accessibility" : "Automation"}`);
    case "reopen": {
      const r = engine.session?.restoreList[m.index];
      if (r?.url) return shell.openExternal(r.url);
      if (r?.bundleId && !IS_WIN) execFile("/usr/bin/open", ["-b", r.bundleId], () => undefined);
      return null;
    }
    case "open":
      return showWindow(m.page);
  }
}

ipcMain.handle("call", async (_e, m: UiMessage) => route(m));

// ───────────────────────── startup ─────────────────────────

let activity: ActivityLog;

app.on("second-instance", () => showWindow("session"));

app.whenReady().then(() => {
  protocol.handle("app", (req) => {
    const { pathname } = new URL(req.url);
    const file = normalize(join(RENDERER, decodeURIComponent(pathname)));
    if (!file.startsWith(RENDERER) || !existsSync(file)) return new Response("not found", { status: 404 });
    return net.fetch(pathToFileURL(file).toString());
  });

  const store = new JsonStore(app.getPath("userData"));
  const categories = new Categories(join(RENDERER, "categories"));
  activity = new ActivityLog(store);
  if (IS_WIN) app.setAppUserModelId(SELF_BUNDLE_ID); // notifications need it on Windows
  const helper = helperCommand();
  system = new HelperSystem(helper.binary, helper.args, {
    idleSeconds: () => powerMonitor.getSystemIdleTime(),
    notify: (title, body) => new Notification({ title, body, silent: true }).show(),
    // Helper problems go to tabhush.log in the app's data folder (for testers to send).
    log: (line) => appendFile(join(app.getPath("userData"), "tabhush.log"), `${new Date().toISOString()} ${line}\n`, () => undefined),
  });
  const judge = new Judge({
    embed,
    categories,
    essentials: () => engine.settings.essentials,
    schoolSites: () => engine.settings.schoolSites,
    selfBundleId: SELF_BUNDLE_ID,
  });
  engine = new Engine({
    store,
    system,
    judge,
    embed,
    activity,
    categories,
    dev: DEV,
    selfBundleId: SELF_BUNDLE_ID,
    openWindow: showWindow,
    onChange: broadcast,
    setRelaunch: (on) => system.setRelaunchFlag(on),
  });

  if (!DEV) app.setLoginItemSettings({ openAtLogin: engine.settings.openAtLogin });

  // macOS: a template glyph with the timer beside it. Windows: the color icon, timer in the tooltip.
  const icon = nativeImage.createFromPath(join(RENDERER, "icons", IS_WIN ? "icon-32.png" : "trayTemplate.png"));
  if (!IS_WIN) icon.setTemplateImage(true);
  tray = new Tray(icon);
  tray.setToolTip(BRAND.NAME);
  if (IS_WIN) tray.on("click", () => showWindow("session"));
  rebuildMenu();
  setInterval(() => {
    const t = trayTitle();
    if (IS_WIN) tray?.setToolTip(t ? `${BRAND.NAME} ·${t}` : BRAND.NAME);
    else tray?.setTitle(t, { fontType: "monospacedDigit" });
  }, MS.SECOND);

  // The lock screen and sleep count as away (TIME-01).
  powerMonitor.on("lock-screen", () => engine.setLocked(true));
  powerMonitor.on("unlock-screen", () => engine.setLocked(false));
  powerMonitor.on("suspend", () => engine.setLocked(true));
  powerMonitor.on("resume", () => engine.setLocked(false));
  // Shutting down or logging out is always allowed; the session resumes at the next login.
  powerMonitor.on("shutdown", () => {
    allowQuit = true;
    system.setRelaunchFlag(false);
  });

  setInterval(() => void engine.tick().catch(() => undefined), DESKTOP.POLL_MS);

  // Q-75: updates on Windows (packaged builds). Never mid-session (INV-14).
  updates = new Updates({
    enabled: IS_WIN && !DEV,
    canInstallNow: () => !engine.session || engine.session.state === "IDLE" || engine.session.state === "ENDED",
    onChange: () => broadcast(),
    notify: (title, body) => new Notification({ title, body, silent: true }).show(),
    log: (line) => appendFile(join(app.getPath("userData"), "tabhush.log"), `${new Date().toISOString()} ${line}\n`, () => undefined),
  });
  updates.start();
  void ensureEmbedder();
  broadcast();

  const s = engine.session;
  if (!engine.settings.onboarded) showWindow("settings");
  else if (!process.argv.includes("--hidden") || (s && s.state !== "IDLE")) showWindow("session");
});

// Q-70: a locked session can't be quit (except on the owner's development build). Shutdown and
// logout still work, and a force quit relaunches the app (the helper's relaunch guard).
app.on("before-quit", (e) => {
  if (allowQuit || !engine?.quitBlocked()) {
    allowQuit = true;
    activity?.flush();
    system?.setRelaunchFlag(false);
    system?.stop();
    return;
  }
  e.preventDefault();
  showWindow("session");
  new Notification({ title: "You’re locked in", body: "Tabhush stays on until your goal. Step away if you need to leave your desk.", silent: true }).show();
});

app.on("window-all-closed", () => {
  // Stay in the menu bar.
});

app.on("activate", () => showWindow("session"));
