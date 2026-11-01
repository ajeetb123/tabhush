-- Backend storage (Q-04: D1). No titles, URLs, domains or request bodies are ever stored.

-- BE-05: single-use proof-of-work challenges.
CREATE TABLE pow_challenges (
  challenge TEXT PRIMARY KEY,
  used INTEGER NOT NULL DEFAULT 0
);

-- BE-05: install tokens, stored as SHA-256 hashes only.
CREATE TABLE installs (
  token_hash TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL
);

-- BE-01 / BE-02: per-install tier 3 calls per UTC day (Q-58).
CREATE TABLE daily_usage (
  token_hash TEXT NOT NULL,
  day TEXT NOT NULL,
  count INTEGER NOT NULL,
  PRIMARY KEY (token_hash, day)
);

-- BE-07: PRIV-30 allowlisted payloads only. Retention period: TODO_Q25.
CREATE TABLE telemetry (
  install_id TEXT NOT NULL,
  day TEXT NOT NULL,
  payload TEXT NOT NULL
);
CREATE INDEX telemetry_install ON telemetry (install_id);
