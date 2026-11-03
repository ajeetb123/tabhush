// Simulated OS helper for the end-to-end run (e2e/run.mjs): the same JSON-lines protocol as
// native/helper.swift, answering from a "world" file the runner edits (front app, open tabs,
// running apps), and logging every action (closing tabs, quitting apps…) instead of doing it.
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";

const [worldPath, logPath] = process.argv.slice(2);
const read = () => JSON.parse(readFileSync(worldPath, "utf8"));
const write = (w) => writeFileSync(worldPath, JSON.stringify(w, null, 1));
const log = (o) => appendFileSync(logPath, JSON.stringify({ at: Date.now(), ...o }) + "\n");

createInterface({ input: process.stdin }).on("line", (line) => {
  let m;
  try {
    m = JSON.parse(line);
  } catch {
    return;
  }
  const w = read();
  let r = {};
  switch (m.cmd) {
    case "trust":
      r = { trusted: true };
      break;
    case "front":
      r = w.front ?? { app: null, title: "" };
      break;
    case "apps":
      r = { apps: w.apps };
      break;
    case "tabs":
      r = { tabs: w.tabs };
      break;
    case "closeTabs": {
      const before = w.tabs.length;
      w.tabs = w.tabs.filter((t) => !(t.bundleId === m.bundleId && m.urls.includes(t.url)));
      const closed = before - w.tabs.length;
      // Like a browser: when the tab in front closes, the next tab of that browser shows.
      if (w.front?.url && m.urls.includes(w.front.url)) {
        const next = w.tabs.find((t) => t.bundleId === m.bundleId);
        w.front = next ? { ...w.front, url: next.url, tabTitle: next.title, title: `${next.title} - Google Chrome` } : w.home;
      }
      write(w);
      log({ closeTabs: m.urls, closed });
      r = { closed };
      break;
    }
    case "closeFrontTab":
      log({ closeFrontTab: m.title });
      r = { closed: true };
      break;
    case "quit":
      w.apps = w.apps.filter((a) => a.bundleId !== m.bundleId);
      if (w.front?.app?.bundleId === m.bundleId) w.front = w.home;
      write(w);
      log({ quit: m.bundleId });
      r = { done: true };
      break;
    case "hide":
      log({ hide: m.bundleId });
      r = { done: true };
      break;
    case "volume": {
      const previous = w.volumes?.[m.bundleId] ?? null;
      if (previous !== null) {
        w.volumes[m.bundleId] = m.level;
        write(w);
      }
      log({ volume: m.bundleId, level: m.level });
      r = { previous };
      break;
    }
    case "relaunch":
      log({ relaunch: m.on });
      r = { on: m.on };
      break;
    default:
      r = { error: `unknown command ${m.cmd}` };
  }
  process.stdout.write(JSON.stringify({ ...r, id: m.id, ok: !r.error }) + "\n");
});
