// The app window is one page (Q-81): Session, Report and Settings are views swapped in place by
// the address after "#", so switching never reloads the page, the background or the fonts.

import { onStateChange, playSwitch } from "./ui/common";
import { reportPage } from "./pages/report";
import { sessionPage } from "./pages/session";
import { settingsPage } from "./pages/settings";

export interface Page {
  /** `entering`: the view was just switched to (animations that play once happen now). */
  render(opts: { entering: boolean }): Promise<void>;
  /** The view is being left: stop its timers, hide its parts. */
  leave(): void;
}

const pages: Record<string, Page> = { session: sessionPage, report: reportPage, settings: settingsPage };
let current = "";

const route = (): string => {
  const r = location.hash.replace(/^#\/?/, "");
  return r in pages ? r : "session";
};

async function go(): Promise<void> {
  const next = route();
  if (next === current) return;
  pages[current]?.leave();
  current = next;
  playSwitch();
  await pages[next]!.render({ entering: true });
  window.scrollTo(0, 0);
}

window.addEventListener("hashchange", () => void go());
// A change in the app (a block, the session's state) redraws the open view only, without replaying its entrance.
onStateChange(() => void pages[current]?.render({ entering: false }));
void go();
