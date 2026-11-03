import type { TelemetryPayload } from "@tabhush/core";
import type { Store } from "../src/store";

export class MemoryStore implements Store {
  challenges = new Map<string, boolean>();
  installs = new Set<string>();
  usage = new Map<string, number>();
  telemetry: { installId: string; day: string; payload: TelemetryPayload }[] = [];

  async putChallenge(c: string) {
    this.challenges.set(c, false);
  }
  async consumeChallenge(c: string) {
    if (this.challenges.get(c) !== false) return false;
    this.challenges.set(c, true);
    return true;
  }
  async putInstall(h: string) {
    this.installs.add(h);
  }
  async hasInstall(h: string) {
    return this.installs.has(h);
  }
  async incrementDailyUsage(h: string, day: string) {
    const k = `${h}|${day}`;
    const n = (this.usage.get(k) ?? 0) + 1;
    this.usage.set(k, n);
    return n;
  }
  async putTelemetry(installId: string, day: string, payload: TelemetryPayload) {
    this.telemetry.push({ installId, day, payload });
  }
  async deleteTelemetry(installId: string) {
    this.telemetry = this.telemetry.filter((t) => t.installId !== installId);
  }
}
