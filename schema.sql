CREATE TABLE IF NOT EXISTS analytics_events (
  event_id TEXT PRIMARY KEY,
  visitor_id TEXT NOT NULL CHECK(length(visitor_id) <= 64),
  run_id TEXT NOT NULL CHECK(length(run_id) <= 64),
  event_type TEXT NOT NULL CHECK(event_type IN ('game_started', 'game_over')),
  occurred_at INTEGER NOT NULL,
  duration_seconds INTEGER CHECK(duration_seconds IS NULL OR (duration_seconds >= 0 AND duration_seconds <= 86400)),
  score INTEGER CHECK(score IS NULL OR (score >= 0 AND score <= 1000000000)),
  UNIQUE(run_id, event_type),
  CHECK((event_type = 'game_started' AND duration_seconds IS NULL AND score IS NULL) OR
        (event_type = 'game_over' AND duration_seconds IS NOT NULL AND score IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_analytics_type_time ON analytics_events(event_type, occurred_at);
CREATE INDEX IF NOT EXISTS idx_analytics_visitor_type ON analytics_events(visitor_id, event_type);
