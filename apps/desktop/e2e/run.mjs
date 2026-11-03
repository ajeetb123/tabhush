// End-to-end run of the real app (Q-79): the built Electron app with its real pages, classifier
// window and engine, but a simulated OS (e2e/world-helper.mjs), its own data folder, and no real
// notifications or reopened tabs. A user's flows are clicked through over the DevTools protocol.
//
//   npm run build && node e2e/run.mjs            (from apps/desktop)
//
// Two passes: as the owner's development copy (can end any time), and as a regular install
// (TABHUSH_AS_USER=1: locked, Step away, Emergency stop). Exits 1 on any failed check or any
// uncaught error in a page.

import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const appDir = join(here, "..");
const electron = createRequire(import.meta.url)("electron");
const PORT = 9339;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const failures = [];
const clicks = [];
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"}  ${name}${ok ? "" : `  ${detail}`}`);
  if (!ok) failures.push(name);
};

// ───────── the simulated world ─────────

const app = (name, bundleId, extra = {}) => ({ name, bundleId, pid: Math.floor(Math.random() * 90000) + 1000, category: "", regular: true, path: `/Applications/${name}.app`, ...extra });
const CHROME = app("Google Chrome", "com.google.Chrome");
const tab = (url, title) => ({ bundleId: CHROME.bundleId, url, title });
const front = (t) => ({ app: CHROME, title: `${t.title} - Google Chrome`, url: t.url, tabTitle: t.title });
const DOCS = tab("https://docs.google.com/document/d/1/edit", "CS 2114 Project 3 writeup");
const RESUME = tab("https://docs.google.com/document/d/9/edit", "Resume tailoring for internship");
const NETFLIX = tab("https://www.netflix.com/watch/81", "Netflix");
const CANVAS = tab("https://canvas.vt.edu/courses/12/assignments", "Assignments");
const STEAM = app("Steam", "com.valvesoftware.steam");
const DOTA = app("Dota 2", "com.valvesoftware.dota2", { path: "/Users/x/Library/Application Support/Steam/steamapps/common/dota 2 beta/game/dota.app" });
const SPOTIFY = app("Spotify", "com.spotify.client", { category: "public.app-category.music" });
const CODE = app("Code", "com.microsoft.VSCode", { category: "public.app-category.developer-tools" });

function newWorld() {
  return {
    front: front(DOCS),
    home: front(DOCS),
    tabs: [DOCS, NETFLIX, CANVAS],
    apps: [CHROME, STEAM, DOTA, SPOTIFY, CODE],
    volumes: { "com.spotify.client": 80 },
    idle: 0,
  };
}

// ───────── a tiny DevTools client ─────────

async function targets() {
  try {
    return await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
  } catch {
    return [];
  }
}

async function connect(target, errors) {
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let id = 0;
  const wait = new Map();
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && wait.has(m.id)) {
      wait.get(m.id)(m);
      wait.delete(m.id);
    } else if (m.method === "Runtime.exceptionThrown") {
      errors.push(`${target.url}: ${m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text}`);
    } else if (m.method === "Runtime.consoleAPICalled" && m.params.args?.[0]?.value === "E2E-CLICK") {
      clicks.push(m.params.args.slice(1).map((a) => a.value).join(" "));
    } else if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") {
      errors.push(`${target.url} console: ${m.params.args.map((a) => a.value ?? a.description).join(" ")}`);
    }
  };
  await new Promise((r) => (ws.onopen = r));
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; wait.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  await send("Runtime.enable");
  await send("Page.enable");
  await send("Page.addScriptToEvaluateOnNewDocument", { source: `document.addEventListener("click", (e) => console.log("E2E-CLICK", (e.target.closest("button,a")?.textContent ?? e.target.tagName).trim().slice(0, 40), e.isTrusted ? "trusted" : "script"), true);` });
  await send("Runtime.evaluate", { expression: `document.addEventListener("click", (e) => console.log("E2E-CLICK", (e.target.closest("button,a")?.textContent ?? e.target.tagName).trim().slice(0, 40), e.isTrusted ? "trusted" : "script"), true)` });
  const evaluate = async (expression) => {
    const r = await send("Runtime.evaluate", { expression: `(async () => (${expression}))()`, awaitPromise: true, returnByValue: true });
    if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description ?? "evaluate failed");
    return r.result?.result?.value;
  };
  return { ws, evaluate };
}

// ───────── a pass ─────────

async function pass(name, { asUser }, steps) {
  console.log(`\n── ${name} ──`);
  const dir = mkdtempSync(join(tmpdir(), "tabhush-e2e-"));
  const worldPath = join(dir, "world.json");
  const logPath = join(dir, "log.jsonl");
  writeFileSync(worldPath, JSON.stringify(newWorld()));
  writeFileSync(logPath, "");
  const proc = spawn(electron, [appDir, `--remote-debugging-port=${PORT}`], {
    env: {
      ...process.env,
      TABHUSH_TEST_HELPER: join(here, "world-helper.mjs"),
      TABHUSH_TEST_WORLD: worldPath,
      TABHUSH_TEST_LOG: logPath,
      TABHUSH_USER_DATA: join(dir, "data"),
      ...(asUser ? { TABHUSH_AS_USER: "1" } : {}),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const mainLog = [];
  proc.stdout.on("data", (d) => mainLog.push(String(d)));
  proc.stderr.on("data", (d) => mainLog.push(String(d)));
  const errors = [];
  try {
    let page;
    for (let i = 0; i < 60 && !page; i++) {
      await sleep(500);
      page = (await targets()).find((t) => t.type === "page" && t.url.startsWith("app://tabhush/") && !t.url.includes("embedder"));
    }
    if (!page) throw new Error("the app window never opened");
    const embedderTarget = (await targets()).find((t) => t.url.includes("embedder"));
    const main = await connect(page, errors);
    const embedder = embedderTarget ? await connect(embedderTarget, errors) : null;

    const world = {
      get: () => JSON.parse(readFileSync(worldPath, "utf8")),
      set: (patch) => writeFileSync(worldPath, JSON.stringify({ ...JSON.parse(readFileSync(worldPath, "utf8")), ...patch })),
      log: () => readFileSync(logPath, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)),
    };
    const ui = {
      eval: (js) => main.evaluate(js),
      call: (msg) => main.evaluate(`window.tabhush.call(${JSON.stringify(msg)})`),
      snap: () => main.evaluate(`window.tabhush.call({ type: "get" })`),
      async waitFor(label, js, ms = 8000) {
        const t0 = Date.now();
        while (Date.now() - t0 < ms) {
          try {
            if (await main.evaluate(js)) return true;
          } catch {
            // page navigating
          }
          await sleep(200);
        }
        check(`(waiting) ${label}`, false, "timed out");
        return false;
      },
      // Like a user: waits until the button is on screen and enabled, then clicks it.
      async click(text, ms = 10000) {
        const t0 = Date.now();
        while (Date.now() - t0 < ms) {
          let ok = false;
          try {
            ok = await main.evaluate(`(() => { const b = [...document.querySelectorAll("button, a")].find((x) => x.textContent.trim() === ${JSON.stringify(text)} && !x.disabled); if (b) b.click(); return !!b; })()`);
          } catch {
            // page navigating
          }
          if (ok) return true;
          await sleep(200);
        }
        check(`click "${text}"`, false, "button not found or disabled");
        return false;
      },
      // Waits for the field to be on screen and enabled, types, and optionally presses Enter.
      async type(selector, text, enter = false, ms = 10000) {
        const t0 = Date.now();
        while (Date.now() - t0 < ms) {
          let ok = false;
          try {
            ok = await main.evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el || el.disabled) return false; el.value = ${JSON.stringify(text)}; el.dispatchEvent(new Event("input", { bubbles: true })); ${enter ? `el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));` : ""} return true; })()`);
          } catch {
            // page navigating
          }
          if (ok) return true;
          await sleep(200);
        }
        check(`type into ${selector}`, false, "field not found or disabled");
        return false;
      },
      text: () => main.evaluate(`document.querySelector("main")?.innerText ?? ""`),
      confirmYes: () => main.evaluate(`(window.confirm = () => true, true)`),
    };
    await steps({ ui, world, sleep });
    void embedder;
  } catch (e) {
    check(`${name} ran to the end`, false, e instanceof Error ? e.message : String(e));
    console.log("  clicks:", clicks.slice(-8).join(" | "));
    const tail = mainLog.join("").split("\n").filter((l) => l.trim() && !/CoreText|DevTools listening/.test(l)).slice(-15);
    if (tail.length) console.log("  app output:\n    " + tail.join("\n    "));
    console.log("  actions logged:", readFileSync(logPath, "utf8").split("\n").filter(Boolean).slice(-8).join("\n    "));
  } finally {
    proc.kill("SIGKILL");
    await sleep(800);
  }
  check(`${name}: no uncaught errors in any page`, errors.length === 0, errors.join(" | "));
}

// ───────── pass 1: the owner's development copy ─────────

await pass("owner (development copy)", { asUser: false }, async ({ ui, world, sleep }) => {
  await ui.waitFor("first run opens setup", `location.pathname === "/settings.html" && document.body.innerText.includes("Set up Tabhush")`, 15000);
  await ui.click("Done, take me to Start");
  await ui.waitFor("Start screen", `location.pathname === "/session.html" && [...document.querySelectorAll("button")].some((b) => b.textContent === "Start")`);

  await ui.click("Start");
  await ui.waitFor("start screen with a task", `document.body.innerText.includes("Let’s lock in") && [...document.querySelectorAll("button")].some((b) => b.textContent.startsWith("Lock in for"))`, 30000);
  let s = (await ui.snap()).session;
  check("task named from the open tabs (course code)", s.taskLabel === "CS 2114", s.taskLabel);
  const proposed = s.preview.map((p) => p.label).sort();
  check("Netflix, Steam and Dota 2 proposed for blocking", ["Dota 2", "Steam", "netflix.com"].every((x) => proposed.includes(x)), proposed.join(","));
  check("the school page is never proposed", !proposed.includes("canvas.vt.edu"), proposed.join(","));

  await ui.type('input[aria-label="Add a task"]', "Resume tailoring", true);
  await ui.waitFor("second task added", `document.querySelectorAll(".chip.on").length === 2`, 15000);
  await ui.type('input[aria-label="Add a task"]', "Calc homework", true);
  await ui.waitFor("third task added", `document.querySelectorAll(".chip.on").length === 3`, 15000);
  check("a fourth task can't be added", await ui.eval(`document.querySelector('input[aria-label="Add a task"]').disabled`));
  await ui.click("Calc homework  ×");
  await ui.waitFor("a task removed", `document.querySelectorAll(".chip.on").length === 2`, 15000);

  await ui.click("25 min");
  await ui.waitFor("goal picked", `[...document.querySelectorAll("button")].some((b) => b.textContent === "Lock in for 25 min")`);
  await ui.click("Lock in for 25 min");
  await ui.waitFor("locked in", `window.tabhush.call({type:"get"}).then((s) => s.session?.state === "ACTIVE")`, 10000);
  await sleep(1500);
  let log = world.log();
  check("Lock in closed the Netflix tab", log.some((l) => l.closeTabs?.includes(NETFLIX.url)));
  check("Lock in quit Steam and Dota 2", log.some((l) => l.quit === STEAM.bundleId) && log.some((l) => l.quit === DOTA.bundleId));
  check("music turned down to 30%", log.some((l) => l.volume === SPOTIFY.bundleId && l.level === 30));
  check("first session offers 'Started by mistake?'", (await ui.text()).includes("Started this by mistake?"));

  world.set({ front: front(DOCS), tabs: [DOCS, RESUME, CANVAS] });
  await sleep(3500);
  world.set({ front: front(RESUME) });
  await sleep(3500);
  const N2 = tab("https://www.netflix.com/browse", "Netflix");
  world.set({ tabs: [...world.get().tabs, N2], front: front(N2) });
  await sleep(3000);
  log = world.log();
  check("a distraction opened mid-session is closed", log.some((l) => l.closeTabs?.includes(N2.url)));
  world.set({ apps: [...world.get().apps, { ...STEAM, pid: 4242 }], front: { app: { ...STEAM, pid: 4242 }, title: "Steam" } });
  await sleep(3000);
  log = world.log();
  check("Steam reopened mid-session is quit again", log.filter((l) => l.quit === STEAM.bundleId).length >= 2);
  s = (await ui.snap()).session;
  const tagged = new Set(s.focusLog.filter((e) => e.state === "on").map((e) => e.task));
  check("work is split between the two tasks", tagged.has("CS 2114") && tagged.has("Resume tailoring"), [...tagged].join(","));

  await ui.click("Cancel session");
  await ui.waitFor("cancel ends without a session", `window.tabhush.call({type:"get"}).then((s) => s.session === null)`);
  log = world.log();
  check("cancel reopens what was closed and quit", log.some((l) => l.reopen?.url === NETFLIX.url) && log.some((l) => l.reopen?.bundleId === STEAM.bundleId));
  check("cancel records nothing", ((await ui.call({ type: "sessions" })) ?? []).length === 0);
  check("cancel puts music back", world.get().volumes["com.spotify.client"] === 80);

  // A real session, ended by the owner, then taken out of the history.
  world.set(newWorld());
  await ui.waitFor("back at Start", `[...document.querySelectorAll("button")].some((b) => b.textContent === "Start")`);
  await ui.click("Start");
  await ui.waitFor("start screen", `[...document.querySelectorAll("button")].some((b) => b.textContent.startsWith("Lock in for"))`, 30000);
  await ui.click("25 min");
  await ui.click("Lock in for 25 min");
  await ui.waitFor("locked in again", `window.tabhush.call({type:"get"}).then((s) => s.session?.state === "ACTIVE")`, 10000);
  await sleep(3000);
  check("owner sees End now", (await ui.text()).includes("you can end any time"));
  await ui.type('input[aria-label="Reason for ending"]', "testing a build");
  await ui.click("End now");
  await ui.waitFor("summary shown", `document.body.innerText.includes("Session over")`, 8000);
  check("summary lists where time went", (await ui.text()).includes("WHERE YOUR TIME WENT"));
  await ui.confirmYes();
  await ui.click("This was a test. Don’t count it");
  await ui.waitFor("test session removed", `window.tabhush.call({type:"sessions"}).then((x) => x.length === 0)`);
  await ui.waitFor("back at Start after removing it", `[...document.querySelectorAll("button")].some((b) => b.textContent === "Start")`);

  // Another session, kept, then deleted from the report; then Start fresh.
  world.set(newWorld());
  await ui.click("Start");
  await ui.waitFor("start screen 3", `[...document.querySelectorAll("button")].some((b) => b.textContent.startsWith("Lock in for"))`, 30000);
  await ui.click("25 min");
  await ui.click("Lock in for 25 min");
  await ui.waitFor("locked in 3", `window.tabhush.call({type:"get"}).then((s) => s.session?.state === "ACTIVE")`, 10000);
  await sleep(2500);
  await ui.type('input[aria-label="Reason for ending"]', "done");
  await ui.click("End now");
  await ui.waitFor("summary 3", `document.body.innerText.includes("Session over")`, 8000);
  await ui.click("Done");
  await ui.waitFor("idle after Done", `[...document.querySelectorAll("button")].some((b) => b.textContent === "Start")`);
  await ui.eval(`(location.href = "report.html", true)`);
  await ui.waitFor("report opens", `location.pathname === "/report.html" && document.body.innerText.includes("BY TASK")`, 8000);
  check("Today lists the task", (await ui.text()).includes("CS 2114"));
  for (const t of ["Activity", "Week", "Sessions"]) {
    await ui.eval(`[...document.querySelectorAll('[role=tab]')].find((b) => b.textContent === ${JSON.stringify(t)}).click()`);
    await sleep(700);
  }
  await ui.eval(`document.querySelector("details.sess-box summary").click()`);
  await sleep(500);
  await ui.confirmYes();
  await ui.click("Delete from history");
  await ui.waitFor("session deleted from the report", `window.tabhush.call({type:"sessions"}).then((x) => x.length === 0)`);
  await ui.eval(`(location.href = "settings.html", true)`);
  await ui.waitFor("settings opens", `location.pathname === "/settings.html" && document.body.innerText.includes("Clear history")`, 8000);
  await ui.confirmYes();
  await ui.click("Clear history");
  await ui.waitFor("start fresh confirms", `document.body.innerText.includes("History cleared.")`);
});

// ───────── pass 2: a regular install ─────────

await pass("regular user (installed copy)", { asUser: true }, async ({ ui, world, sleep }) => {
  await ui.waitFor("setup opens", `location.pathname === "/settings.html"`, 15000);
  await ui.click("Done, take me to Start");
  await ui.waitFor("Start", `[...document.querySelectorAll("button")].some((b) => b.textContent === "Start")`);
  await ui.click("Start");
  await ui.waitFor("start screen", `[...document.querySelectorAll("button")].some((b) => b.textContent.startsWith("Lock in for"))`, 30000);
  await ui.click("25 min");
  await ui.click("Lock in for 25 min");
  await ui.waitFor("locked in", `document.body.innerText.includes("You’re locked in")`, 15000);
  await sleep(1500);
  const text = await ui.text();
  check("no End now for a regular user", !text.includes("End now"));
  check("Step away and the emergency stop are offered", text.includes("Step away") && text.includes("Real emergency?"));
  check("break chips are off until breaks are earned", await ui.eval(`[...document.querySelectorAll("button.chip")].filter((b) => /min$/.test(b.textContent) && b.closest(".card")?.innerText.includes("Break")).every((b) => b.disabled)`));
  const access = (await ui.snap()).endAccess;
  check("a regular user can't end before the goal", access.canEnd === false && access.dev === false);

  await ui.click("Step away");
  await ui.waitFor("paused", `window.tabhush.call({type:"get"}).then((s) => s.session?.state === "IDLE_PAUSED")`);
  check("paused screen", (await ui.text()).includes("Go do your thing"));
  await ui.click("I’m back");
  await ui.waitFor("resumed", `window.tabhush.call({type:"get"}).then((s) => s.session?.state === "ACTIVE")`);

  world.set({ idle: 200 });
  await sleep(2500);
  let s = (await ui.snap()).session;
  check("no input for 3 minutes counts as away", s.focusLog[s.focusLog.length - 1]?.state === "away");
  world.set({ idle: 0 });
  await sleep(2000);

  await ui.click("Real emergency?");
  await sleep(300);
  await ui.type('input[aria-label="Emergency reason"]', "family emergency");
  const holdDisabled = await ui.eval(`document.querySelector(".btn.hold").disabled`);
  check("hold button stays off until the passage is typed", holdDisabled === true);
  const passage = await ui.eval(`document.querySelector(".passage").textContent`);
  await ui.type('textarea[aria-label="Type the passage"]', passage.slice(0, 20));
  check("a partly typed passage keeps it off", await ui.eval(`document.querySelector(".btn.hold").disabled`));
  await ui.type('textarea[aria-label="Type the passage"]', passage);
  check("the full passage turns it on", (await ui.eval(`document.querySelector(".btn.hold").disabled`)) === false);
  await ui.eval(`document.querySelector(".btn.hold").dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }))`);
  await ui.waitFor("emergency countdown starts after the hold", `window.tabhush.call({type:"get"}).then((s) => s.session?.state === "END_COUNTDOWN" && !!s.session.emergency)`, 6000);
  await ui.waitFor("the session ends after 60 s", `window.tabhush.call({type:"get"}).then((s) => s.session?.state === "ENDED")`, 70000);
  s = (await ui.snap()).session;
  check("it shows as an emergency stop", s.endKind === "emergency");
  check("summary says emergency stop", (await ui.text()).includes("Emergency stop"));

  await ui.click("Start a new session");
  await ui.waitFor("start screen again", `[...document.querySelectorAll("button")].some((b) => b.textContent.startsWith("Lock in for"))`, 30000);
  await ui.click("25 min");
  await ui.click("Lock in for 25 min");
  await ui.waitFor("locked in again", `window.tabhush.call({type:"get"}).then((s) => s.session?.state === "ACTIVE")`, 10000);
  await sleep(1000);
  await ui.click("Real emergency?");
  await sleep(300);
  check("only one emergency stop a day", (await ui.text()).includes("used today’s emergency stop"));
  check("settings are locked during a session", await ui.call({ type: "clearHistory" }).then((ok) => ok === false));
});

console.log(failures.length ? `\n${failures.length} failed: ${failures.join("; ")}` : "\nall end-to-end checks passed");
process.exit(failures.length ? 1 : 0);
