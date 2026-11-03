// The OS layer the engine uses (docs/11 DSK-10). The real one talks to the bundled Swift helper;
// tests use a fake. Every call fails soft: a missing permission means less data, never a crash.

import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";

export interface AppInfo {
  name: string;
  bundleId: string;
  pid: number;
  /** LSApplicationCategoryType from the app's Info.plist, e.g. "public.app-category.games". */
  category: string;
  /** False for background agents (notification popups and the like). */
  regular?: boolean;
  /** Where the app is installed (the .app bundle or the .exe), for recognizing games (Q-74). */
  path?: string;
}

export interface FrontInfo {
  app: AppInfo | null;
  /** Focused window title (needs Accessibility). */
  title: string;
  /** Active tab of a scriptable browser's front window (Apple Events). */
  url?: string;
  tabTitle?: string;
}

export interface BrowserTab {
  bundleId: string;
  url: string;
  title: string;
}

export interface System {
  front(): Promise<FrontInfo>;
  apps(): Promise<AppInfo[]>;
  tabs(): Promise<BrowserTab[]>;
  closeTabs(bundleId: string, urls: string[]): Promise<number>;
  closeFrontTab(bundleId: string, expectedTitle: string): Promise<boolean>;
  quit(bundleId: string): Promise<boolean>;
  hide(bundleId: string): Promise<boolean>;
  /** Sets an app's own volume (0-100); returns the previous level, or null. */
  setVolume(bundleId: string, level: number): Promise<number | null>;
  accessibilityTrusted(prompt: boolean): Promise<boolean>;
  /** Seconds since the last keyboard or mouse input. */
  idleSeconds(): number;
  notify(title: string, body: string): void;
}

type Reply = Record<string, unknown> & { id: number; ok: boolean };

/** Talks to tabhush-helper over stdin/stdout, one JSON object per line. */
export class HelperSystem implements System {
  private proc: ChildProcessWithoutNullStreams | null = null;
  private nextId = 1;
  private pending = new Map<number, (r: Reply | null) => void>();
  private retryAfter = 0;
  /** The helper's last failure (start error, compile error, stderr), shown in Settings for testers. */
  private _lastError: string | null = null;

  get lastError(): string | null {
    return this._lastError;
  }

  set lastError(e: string | null) {
    if (e && e !== this._lastError) this.env.log?.(e);
    this._lastError = e;
  }

  constructor(
    private readonly binary: string,
    private readonly args: string[],
    private readonly env: { idleSeconds: () => number; notify: (title: string, body: string) => void; log?: (line: string) => void },
  ) {}

  private ensure(): ChildProcessWithoutNullStreams | null {
    if (this.proc && this.proc.exitCode === null && !this.proc.killed) return this.proc;
    // A helper that keeps failing is retried every 30 s, not on every poll.
    if (Date.now() < this.retryAfter) return null;
    const started = Date.now();
    const proc = spawn(this.binary, this.args, { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
    createInterface({ input: proc.stdout }).on("line", (line) => {
      try {
        const r = JSON.parse(line.replace(/^\uFEFF/, "")) as Reply;
        if (!r.ok && typeof r.error === "string") this.lastError = r.error;
        this.pending.get(r.id)?.(r);
        this.pending.delete(r.id);
      } catch {
        // not a reply line
      }
    });
    proc.stderr.on("data", (d: Buffer) => (this.lastError = String(d).trim().slice(0, 500) || this.lastError));
    proc.on("error", (e) => (this.lastError = `helper didn't start: ${e.message}`));
    proc.on("exit", (code) => {
      if (code && Date.now() - started < 30_000) this.retryAfter = Date.now() + 30_000;
      for (const done of this.pending.values()) done(null);
      this.pending.clear();
    });
    this.proc = proc;
    return proc;
  }

  private call(cmd: string, extra: Record<string, unknown> = {}, timeoutMs = 4000): Promise<Reply | null> {
    const id = this.nextId++;
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        resolve(null);
      }, timeoutMs);
      this.pending.set(id, (r) => {
        clearTimeout(timer);
        resolve(r);
      });
      try {
        const proc = this.ensure();
        if (!proc) throw new Error("helper unavailable");
        proc.stdin.write(JSON.stringify({ id, cmd, ...extra }) + "\n");
      } catch {
        clearTimeout(timer);
        this.pending.delete(id);
        resolve(null);
      }
    });
  }

  /** Lets the helper relaunch the app if this process is killed mid-session (Q-70). */
  setRelaunchFlag(on: boolean): void {
    void this.call("relaunch", { on });
  }

  stop(): void {
    this.proc?.stdin.end();
  }

  async front(): Promise<FrontInfo> {
    const r = await this.call("front");
    if (!r?.ok) return { app: null, title: "" };
    return { app: (r.app as AppInfo | null) ?? null, title: String(r.title ?? ""), url: r.url as string | undefined, tabTitle: r.tabTitle as string | undefined };
  }

  async apps(): Promise<AppInfo[]> {
    return ((await this.call("apps"))?.apps as AppInfo[] | undefined) ?? [];
  }

  async tabs(): Promise<BrowserTab[]> {
    return ((await this.call("tabs", {}, 15000))?.tabs as BrowserTab[] | undefined) ?? [];
  }

  async closeTabs(bundleId: string, urls: string[]): Promise<number> {
    return Number((await this.call("closeTabs", { bundleId, urls }, 15000))?.closed ?? 0);
  }

  async closeFrontTab(bundleId: string, expectedTitle: string): Promise<boolean> {
    return (await this.call("closeFrontTab", { bundleId, title: expectedTitle }))?.closed === true;
  }

  async quit(bundleId: string): Promise<boolean> {
    return (await this.call("quit", { bundleId }))?.done === true;
  }

  async hide(bundleId: string): Promise<boolean> {
    return (await this.call("hide", { bundleId }))?.done === true;
  }

  async setVolume(bundleId: string, level: number): Promise<number | null> {
    const prev = (await this.call("volume", { bundleId, level }))?.previous;
    return typeof prev === "number" ? prev : null;
  }

  async accessibilityTrusted(prompt: boolean): Promise<boolean> {
    return (await this.call("trust", { prompt }))?.trusted === true;
  }

  idleSeconds(): number {
    return this.env.idleSeconds();
  }

  notify(title: string, body: string): void {
    this.env.notify(title, body);
  }
}
