// Automatic updates (Q-75, DSK-30 "signed auto-updates" without the signing yet). Windows only for
// now: macOS refuses to auto-update an app that isn't signed with an Apple Developer ID.
//
// The app checks the public releases repo (ajeetb123/tabhush-releases) at start and every few
// hours and downloads a new version in the background. It never installs during a session
// (INV-14): the update waits, and "Restart to update" is offered once no session is running.

import updater from "electron-updater";
import { DESKTOP, MS } from "@lockin/core";

// Accessed only when updates are on: the library sets itself up on first use.
const au = () => updater.autoUpdater;

export type UpdateState = "off" | "idle" | "checking" | "downloading" | "ready" | "error";

export interface UpdateStatus {
  state: UpdateState;
  /** The version waiting to be installed, when ready. */
  version: string | null;
}

export class Updates {
  status: UpdateStatus;
  private notified = false;

  constructor(
    private readonly d: {
      enabled: boolean;
      /** False while a session is running (INV-14). */
      canInstallNow: () => boolean;
      onChange: () => void;
      notify: (title: string, body: string) => void;
      log: (line: string) => void;
    },
  ) {
    this.status = { state: d.enabled ? "idle" : "off", version: null };
  }

  start(): void {
    if (!this.d.enabled) return;
    const autoUpdater = au();
    // Set here rather than relying on the generated app-update.yml.
    autoUpdater.setFeedURL({ provider: "github", owner: DESKTOP.UPDATE_OWNER, repo: DESKTOP.UPDATE_REPO, releaseType: "release" });
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = false; // installing is always our explicit, out-of-session step
    autoUpdater.logger = { info: () => undefined, warn: (m: unknown) => this.d.log(`update: ${String(m)}`), error: (m: unknown) => this.d.log(`update: ${String(m)}`), debug: () => undefined };
    autoUpdater.on("checking-for-update", () => this.set("checking"));
    autoUpdater.on("update-not-available", () => this.set("idle"));
    autoUpdater.on("download-progress", () => this.set("downloading"));
    autoUpdater.on("update-downloaded", (info) => {
      this.status = { state: "ready", version: info.version };
      this.d.onChange();
      this.offer();
    });
    autoUpdater.on("error", (e) => {
      this.d.log(`update failed: ${e instanceof Error ? e.message : String(e)}`);
      this.set("error");
    });
    const check = () => void autoUpdater.checkForUpdates().catch(() => undefined);
    setTimeout(check, DESKTOP.UPDATE_FIRST_CHECK_SEC * MS.SECOND);
    setInterval(check, DESKTOP.UPDATE_CHECK_HOURS * MS.HOUR);
  }

  /** Tells the user once an update is ready and no session is running. Call when a session ends too. */
  offer(): void {
    if (this.status.state !== "ready" || this.notified || !this.d.canInstallNow()) return;
    this.notified = true;
    this.d.notify(`Tabhush ${this.status.version} is ready`, "Restart Tabhush to update. It takes a few seconds.");
  }

  /** Installs the downloaded update and restarts. Refused during a session. */
  installNow(): boolean {
    if (this.status.state !== "ready" || !this.d.canInstallNow()) return false;
    setImmediate(() => au().quitAndInstall(true, true));
    return true;
  }

  private set(state: UpdateState): void {
    if (this.status.state === "ready") return; // a downloaded update stays ready
    this.status = { ...this.status, state };
    this.d.onChange();
  }
}
