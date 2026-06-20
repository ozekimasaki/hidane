-- Tanebi structured memory (learning log)
CREATE TABLE IF NOT EXISTS turns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  wish TEXT NOT NULL,
  summary TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_turns_user ON turns (user_id, created_at);

CREATE TABLE IF NOT EXISTS concepts (
  user_id TEXT NOT NULL,
  concept TEXT NOT NULL,
  first_seen INTEGER NOT NULL,
  PRIMARY KEY (user_id, concept)
);
