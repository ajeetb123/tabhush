// Service worker entry. Every listener is registered synchronously at top level so events wake
// the worker after suspension (MV3). State lives in storage, never only in memory (EXT-04).

import type { FromContent, FromUi } from "../shared/messages";
import { removePreBlocks } from "./enforce";
import {
  answerAsk,
  answerParkCheck,
  confirm,
  consent,
  dismiss,
  END_ALARM,
  BREAK_ALARM,
  IDLE_PAUSE_ALARM,
  PAUSE_END_ALARM,
  emergencyStop,
  endAccess,
  idlePause,
  onIdleState,
  pauseTimedOut,
  resume,
  stepAway,
  startBreak,
  endBreak,
  finishEnd,
  forgetTab,
  onBlockedVisit,
  onInputCounts,
  onTabChanged,
  onYoutubeMeta,
  onContentReady,
  onPageSnippet,
  onFocusChange,
  override,
  overrideBlocked,
  requestEnd,
  sessionInProgress,
  sessionHistoryMinutes,
  setTasks,
  start,
  stop,
  togglePreview,
  undo,
} from "./engine";
import { loadSession } from "./session";
import { getInternal, getSettings, setInternal, setSettings } from "./settings";
import { sendTelemetry, TELEMETRY_ALARM, TELEMETRY_PERIOD_MIN } from "./telemetry";
import { onUpdateAvailable } from "./updates";
import { BUILD_ID } from "../shared/build";
import { ACTIVE_TIME } from "@lockin/core";

const START_COMMAND = "start-session";
const SESSION_PAGE = "ui/session.html";

// LOOP-01: Start from the toolbar popup or the keyboard shortcut.
chrome.commands.onCommand.addListener((command) => {
  if (command === START_COMMAND) void start();
});

// LOOP-05: judge every new item; SPAs are re-judged on every in-page navigation.
chrome.tabs.onUpdated.addListener((_id, info, tab) => {
  if (info.status === "complete" || info.title !== undefined || info.url !== undefined) void onTabChanged(tab);
});
chrome.webNavigation.onHistoryStateUpdated.addListener((d) => {
  if (d.frameId !== 0) return;
  void chrome.tabs.get(d.tabId).then(onTabChanged, () => undefined);
});
chrome.tabs.onRemoved.addListener((tabId) => forgetTab(tabId));

// Focus time for the report (Q-65): which tab is in front, and whether the browser is.
chrome.tabs.onActivated.addListener(({ tabId }) => void onFocusChange(tabId));
chrome.windows.onFocusChanged.addListener((windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) return void onFocusChange(null);
  void chrome.tabs.query({ active: true, windowId }).then(([t]) => onFocusChange(t?.id ?? null), () => undefined);
});

// Q-69: no input for a few minutes counts as away; 30 min pauses the session, 2 h ends it.
chrome.idle.setDetectionInterval(ACTIVE_TIME.NO_INPUT_STOP_MIN * 60);
chrome.idle.onStateChanged.addListener((state) => void onIdleState(state));

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === END_ALARM) void finishEnd();
  if (alarm.name === BREAK_ALARM) void endBreak();
  if (alarm.name === IDLE_PAUSE_ALARM) void idlePause();
  if (alarm.name === PAUSE_END_ALARM) void pauseTimedOut();
  if (alarm.name === TELEMETRY_ALARM) void sendTelemetry();
});

// INV-14: an update arriving mid-session waits until the session ends (applied in finishEnd).
chrome.runtime.onUpdateAvailable.addListener(() => {
  void onUpdateAvailable({
    sessionInProgress,
    markPending: async () => void (await setInternal({ pendingUpdate: true })),
    reload: () => chrome.runtime.reload(),
  });
});

/**
 * After an install, update or reload, Chrome does not put the new content script into tabs that
 * are already open (their old copy, if any, is cut off). Inject it now so they are covered without
 * a refresh. The script's liveness flag lets the fresh copy start next to an orphaned one.
 */
async function injectIntoOpenTabs(): Promise<void> {
  const open = await chrome.tabs.query({ url: ["http://*/*", "https://*/*"] });
  await Promise.all(
    open.map((t) =>
      t.id === undefined
        ? undefined
        : chrome.scripting.executeScript({ target: { tabId: t.id, allFrames: true }, files: ["content.js"] }).catch(() => undefined),
    ),
  );
}

chrome.runtime.onStartup.addListener(() => {
  void (async () => {
    // Restart recovery is beta 2 (LOOP-11). Without an active session, no rule may stay behind.
    const s = await loadSession();
    if (!s || s.state === "IDLE" || s.state === "ENDED") await removePreBlocks();
  })();
});

chrome.runtime.onInstalled.addListener((details) => {
  void getInternal(); // mints the telemetry install ID
  // EXT-12: first-run setup opens once, on a fresh install.
  if (details.reason === "install") void chrome.tabs.create({ url: chrome.runtime.getURL("ui/onboarding.html") });
  void injectIntoOpenTabs();
  void chrome.alarms.create(TELEMETRY_ALARM, { periodInMinutes: TELEMETRY_PERIOD_MIN });
});

chrome.runtime.onMessage.addListener((msg: FromUi | FromContent | { target?: string }, sender, sendResponse) => {
  if ("target" in msg && msg.target === "offscreen") return false;
  const tab = sender.tab;
  const m = msg as FromUi | FromContent;
  const done = (p: Promise<unknown>) => {
    p.then(
      (v) => sendResponse({ ok: true, value: v ?? null }),
      (e: unknown) => sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) }),
    );
    return true;
  };
  switch (m.type) {
    // content script
    case "content:ready":
      return tab ? done(onContentReady(tab)) : false;
    case "input:counts":
      return tab ? done(onInputCounts(tab, m.minuteStart, m.count)) : false;
    case "ask:answer":
      return tab ? done(answerAsk(tab, m.related)) : false;
    case "page:snippet":
      return tab ? done(onPageSnippet(tab, m.url, m.text)) : false;
    case "youtube:meta":
      return tab ? done(onYoutubeMeta(tab, m.videoId, m.genre, m.title, m.channel)) : false;
    case "check:answer":
      return tab ? done(answerParkCheck(tab, m.right)) : false;
    case "override:submit":
      return tab ? done(override(tab, m.sentence)) : false;
    case "open:session":
      return done(chrome.tabs.create({ url: chrome.runtime.getURL(SESSION_PAGE) }));
    // UI pages
    case "ui:start":
      return done(start());
    case "ui:get":
      return done(
        (async () => ({
          session: await loadSession(),
          endAccess: await endAccess(await loadSession()),
          settings: await getSettings(),
          internal: await getInternal(),
          history: await sessionHistoryMinutes(),
          buildId: BUILD_ID,
        }))(),
      );
    case "ui:setTasks":
      return done(setTasks(m.labels));
    case "ui:toggle":
      return done(togglePreview(m.tabId, m.park));
    case "ui:confirm":
      return done(confirm(m.goalMin));
    case "ui:stop":
      return done(stop());
    case "ui:break":
      return done(startBreak(m.min));
    case "ui:breakEnd":
      return done(endBreak());
    case "ui:undo":
      return done(undo());
    case "ui:end":
      return done(requestEnd(m.reason));
    case "ui:emergency":
      return done(emergencyStop(m.reason));
    case "ui:stepAway":
      return done(stepAway());
    case "ui:resume":
      return done(resume());
    case "ui:dismiss":
      return done(dismiss());
    case "ui:consent":
      return done(consent(m.granted));
    case "ui:settings":
      return done(
        (async () => {
          // LOCK-01: settings are locked during a session.
          if (await sessionInProgress()) throw new Error("Settings are locked until the session ends.");
          return setSettings(m.patch);
        })(),
      );
    case "ui:blocked":
      return done(onBlockedVisit(m.url));
    case "ui:overrideBlocked":
      return done(overrideBlocked(m.url, m.sentence));
    default:
      return false;
  }
});
