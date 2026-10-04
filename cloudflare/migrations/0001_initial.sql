CREATE TABLE IF NOT EXISTS processed_events (
  event_id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'retry', 'completed', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS processed_events_status_idx
  ON processed_events (status, updated_at);

CREATE TABLE IF NOT EXISTS rate_limits (
  limiter_key TEXT PRIMARY KEY,
  window_started_at INTEGER NOT NULL,
  request_count INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS delivery_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('telegram', 'lark')),
  destination_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('delivered', 'failed')),
  error TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (event_id) REFERENCES processed_events(event_id)
);

CREATE INDEX IF NOT EXISTS delivery_logs_event_idx
  ON delivery_logs (event_id, created_at);
