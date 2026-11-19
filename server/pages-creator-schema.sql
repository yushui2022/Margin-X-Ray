CREATE TABLE creator_live_cache (
  handle TEXT PRIMARY KEY,
  payload TEXT,
  http_status INTEGER,
  expires_at INTEGER NOT NULL DEFAULT 0,
  lease_id TEXT,
  lease_until INTEGER NOT NULL DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE creator_live_budget (
  day TEXT PRIMARY KEY,
  used INTEGER NOT NULL
);
