// Backend storage (Q-04): D1 for tokens, caps and telemetry. The interface lets tests run on
// an in-memory store. Nothing here ever stores a title, URL or request body (INV-18).

import type { TelemetryPayload } from "@tabhush/core";

export interface Store {
  /** Saves a fresh, unused proof-of-work challenge. */
  putChallenge(challenge: string): Promise<void>;
  /** Marks a challenge used; false if unknown or already used. */
  consumeChallenge(challenge: string): Promise<boolean>;
  putInstall(tokenHash: string, createdAt: number): Promise<void>;
  hasInstall(tokenHash: string): Promise<boolean>;
  /** Increments and returns the tier 3 call count for this install on this UTC day. */
  incrementDailyUsage(tokenHash: string, day: string): Promise<number>;
  putTelemetry(installId: string, day: string, payload: TelemetryPayload): Promise<void>;
  deleteTelemetry(installId: string): Promise<void>;
}

export class D1Store implements Store {
  constructor(private readonly db: D1Database) {}

  async putChallenge(challenge: string) {
    await this.db.prepare("INSERT INTO pow_challenges (challenge, used) VALUES (?, 0)").bind(challenge).run();
  }

  async consumeChallenge(challenge: string) {
    const r = await this.db.prepare("UPDATE pow_challenges SET used = 1 WHERE challenge = ? AND used = 0").bind(challenge).run();
    return (r.meta.changes ?? 0) === 1;
  }

  async putInstall(tokenHash: string, createdAt: number) {
    await this.db.prepare("INSERT INTO installs (token_hash, created_at) VALUES (?, ?)").bind(tokenHash, createdAt).run();
  }

  async hasInstall(tokenHash: string) {
    const row = await this.db.prepare("SELECT 1 AS ok FROM installs WHERE token_hash = ?").bind(tokenHash).first<{ ok: number }>();
    return row !== null;
  }

  async incrementDailyUsage(tokenHash: string, day: string) {
    const row = await this.db
      .prepare(
        `INSERT INTO daily_usage (token_hash, day, count) VALUES (?, ?, 1)
         ON CONFLICT (token_hash, day) DO UPDATE SET count = count + 1
         RETURNING count`,
      )
      .bind(tokenHash, day)
      .first<{ count: number }>();
    return row?.count ?? Number.POSITIVE_INFINITY;
  }

  async putTelemetry(installId: string, day: string, payload: TelemetryPayload) {
    await this.db
      .prepare("INSERT INTO telemetry (install_id, day, payload) VALUES (?, ?, ?)")
      .bind(installId, day, JSON.stringify(payload))
      .run();
  }

  async deleteTelemetry(installId: string) {
    await this.db.prepare("DELETE FROM telemetry WHERE install_id = ?").bind(installId).run();
  }
}
