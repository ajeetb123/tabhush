// Backtest (Q-84): replays every saved session in a Tabhush data folder through the real engine, the
// bundled model and the saved tasks, and prints minutes per task as saved vs as the current code
// logs them. Run: npm run backtest -w @tabhush/desktop   (TABHUSH_DATA=<folder> for another copy;
// SESSION_TASKS='<id prefix>=Task A|Task B' replays one session with different tasks.)
// The data stays where it is; nothing is written back.
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "vitest";
import { env, pipeline } from "@huggingface/transformers";
import { EMBEDDING, type Task } from "@tabhush/core";
import { ActivityLog } from "../src/main/activity";
import { Categories } from "../src/main/categories";
import { Engine } from "../src/main/engine";
import { Judge } from "../src/main/judge";
import { JsonStore } from "../src/main/store";
import { asSessionLike, productiveParts, type SessionLike } from "../src/shared/reportData";
import type { FocusEntry, Session } from "../src/shared/types";
import { app, CHROME, chromeTab, Clock, FakeSystem } from "../test/fakes";

const here = new URL(".", import.meta.url).pathname;
const DATA = process.env.TABHUSH_DATA ?? (process.platform === "darwin" ? join(homedir(), "Library/Application Support/Tabhush") : join(process.env.APPDATA ?? "", "Tabhush"));
// Apps the saved log names without an ID; anything else is "some other app".
const APP_IDS: Record<string, string> = {
  Claude: "com.anthropic.claudefordesktop", Finder: "com.apple.finder", Preview: "com.apple.Preview", Tabhush: "com.tabhush.app",
  "System Settings": "com.apple.systempreferences", "Google Chrome": "com.google.Chrome", Safari: "com.apple.Safari", Code: "com.microsoft.VSCode",
};

/** What was in front, rebuilt from a focus entry (the log keeps the site and title, not the address). */
function frontFor(e: FocusEntry) {
  const d = e.domain ?? "", title = e.title ?? "";
  if (!d) return { app: CHROME, title: title ? `${title} - Google Chrome` : "" }; // a title-only browser window
  if (d === "newtab") return chromeTab("chrome://newtab/", title);
  if (d.includes(".")) {
    const url = d === "google.com" && title.endsWith(" - Google Search") ? `https://www.google.com/search?q=${encodeURIComponent(title.slice(0, -16))}` : `https://${d}/`;
    return chromeTab(url, title);
  }
  return { app: app(d, APP_IDS[d] ?? `local.${d.toLowerCase().replace(/\W+/g, "")}`), title };
}

const minutes = (s: SessionLike, now: number) => Object.fromEntries(productiveParts(s, now).map((p) => [p.label, +(p.ms / 60000).toFixed(1)]));

test("backtest", async () => {
  if (!existsSync(join(DATA, "sessions.json"))) throw new Error(`no sessions.json in ${DATA}`);
  env.allowRemoteModels = false;
  env.allowLocalModels = true;
  env.localModelPath = join(here, "../public/models/");
  const fe = await pipeline("feature-extraction", EMBEDDING.HF_REPO, { dtype: EMBEDDING.TRANSFORMERS_DTYPE as "int8" });
  const embed = async (t: string[]) => (await fe(t, { pooling: "mean", normalize: true })).tolist() as number[][];
  const tasks = JSON.parse(readFileSync(join(DATA, "tasks.json"), "utf8")) as Task[];
  const sessions = JSON.parse(readFileSync(join(DATA, "sessions.json"), "utf8")) as Session[];
  const override = process.env.SESSION_TASKS?.split("=");

  async function replay(sess: Session, labels: string[]) {
    const sys = new FakeSystem(), clock = new Clock(sess.committedAt! - 2000);
    const store = new JsonStore(mkdtempSync(join(tmpdir(), "tabhush-backtest-")));
    store.write("tasks", structuredClone(tasks));
    const categories = new Categories(join(here, "../public/categories"));
    const judge = new Judge({ embed, categories, essentials: () => [], schoolSites: () => [], selfBundleId: "com.tabhush.app" });
    const e = new Engine({ store, system: sys, judge, embed, activity: new ActivityLog(store), categories, dev: true, selfBundleId: "com.tabhush.app", openWindow: () => undefined, onChange: () => undefined, setRelaunch: () => undefined, now: clock.now });
    await e.start();
    await e.setTasks(labels);
    await e.confirm(sess.goalMin ?? 45);
    let undecided = 0, on = 0;
    for (const en of sess.focusLog) {
      clock.t = Math.max(en.at, clock.t);
      // Saved away stretches start exactly at their entry, so lock the screen for them rather than fake idle time, which would be backdated.
      if (en.state === "away") e.setLocked(true);
      else {
        e.setLocked(false);
        sys.idle = 0;
        sys.frontNow = frontFor(en);
      }
      await e.tick();
    }
    for (const x of e.session!.focusLog) if (x.state === "on") { on++; if (!x.task) undecided++; }
    const end = sess.endedAt ?? clock.t;
    return { minutes: minutes(asSessionLike({ ...e.session!, endedAt: end }), end), note: `${e.session!.focusLog.length} entries (saved ${sess.focusLog.length}), ${undecided}/${on} on-entries undecided at write time` };
  }

  for (const s of sessions) {
    if (s.committedAt === null) continue;
    const labels = s.taskLabels?.length ? s.taskLabels : [s.taskLabel ?? "Untitled"];
    const end = s.endedAt ?? Date.now();
    console.log(`\n== ${new Date(s.committedAt).toLocaleString()} · ${labels.join(" + ")} · ${((end - s.committedAt) / 60000).toFixed(1)} min`);
    console.log("   saved :", JSON.stringify(minutes(asSessionLike(s), end)));
    const r = await replay(s, labels);
    console.log("   now   :", JSON.stringify(r.minutes), "·", r.note);
    if (override && s.id.startsWith(override[0]!)) {
      const alt = override[1]!.split("|");
      console.log(`   with tasks ${alt.join(" + ")}:`, JSON.stringify((await replay(s, alt)).minutes));
    }
  }
});
