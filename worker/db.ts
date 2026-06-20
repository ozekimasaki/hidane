export interface Artifact {
  code: string;
  html: string | null;
}

let schemaReady = false;

/**
 * Create tables on demand. Migrations cover this for production, but this keeps
 * local dev working even if `wrangler d1 migrations apply` hasn't run yet.
 */
export async function ensureSchema(env: Env): Promise<void> {
  if (!env.DB || schemaReady) return;
  try {
    await env.DB.batch([
      env.DB.prepare(
        `CREATE TABLE IF NOT EXISTS turns (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id TEXT NOT NULL,
          wish TEXT NOT NULL,
          summary TEXT,
          created_at INTEGER NOT NULL
        );`,
      ),
      env.DB.prepare(
        `CREATE TABLE IF NOT EXISTS concepts (
          user_id TEXT NOT NULL,
          concept TEXT NOT NULL,
          first_seen INTEGER NOT NULL,
          PRIMARY KEY (user_id, concept)
        );`,
      ),
      env.DB.prepare(
        `CREATE TABLE IF NOT EXISTS artifacts (
          session_id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          code TEXT NOT NULL,
          html TEXT,
          created_at INTEGER NOT NULL
        );`,
      ),
    ]);
    schemaReady = true;
  } catch (err) {
    console.error("ensureSchema failed:", err);
  }
}

export async function logTurn(
  env: Env,
  userId: string,
  wish: string,
  summary: string,
): Promise<void> {
  if (!env.DB) return;
  try {
    await env.DB.prepare(
      `INSERT INTO turns (user_id, wish, summary, created_at) VALUES (?, ?, ?, ?);`,
    )
      .bind(userId, wish, summary, Date.now())
      .run();
  } catch (err) {
    console.error("logTurn failed:", err);
  }
}

export async function addConcepts(
  env: Env,
  userId: string,
  concepts: string[],
): Promise<void> {
  if (!env.DB || concepts.length === 0) return;
  try {
    const now = Date.now();
    await env.DB.batch(
      concepts.map((concept) =>
        env.DB.prepare(
          `INSERT OR IGNORE INTO concepts (user_id, concept, first_seen) VALUES (?, ?, ?);`,
        ).bind(userId, concept, now),
      ),
    );
  } catch (err) {
    console.error("addConcepts failed:", err);
  }
}

export async function storeArtifact(
  env: Env,
  sessionId: string,
  userId: string,
  code: string,
  html: string | null,
): Promise<void> {
  if (!env.DB) return;
  await env.DB.prepare(
    `INSERT OR REPLACE INTO artifacts (session_id, user_id, code, html, created_at) VALUES (?, ?, ?, ?, ?);`,
  )
    .bind(sessionId, userId, code, html, Date.now())
    .run();
}

export async function loadArtifact(env: Env, sessionId: string): Promise<Artifact | null> {
  if (!env.DB) return null;
  try {
    const row = await env.DB.prepare(
      `SELECT code, html FROM artifacts WHERE session_id = ?;`,
    )
      .bind(sessionId)
      .first<{ code: string; html: string | null }>();
    if (!row) return null;
    return { code: row.code, html: row.html };
  } catch (err) {
    console.error("loadArtifact failed:", err);
    return null;
  }
}
