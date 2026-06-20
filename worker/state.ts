import { DurableObject } from "cloudflare:workers";
import { computeScore, scoreToFrame, frameToBand } from "./flame.ts";
import type { FlameState, MemoryNote, StateResponse, StoredResult } from "./types.ts";

function dateKey(ms: number): string {
  // Use JST (UTC+9) day boundaries so "consecutive days" matches the user's
  // local calendar instead of UTC.
  return new Date(ms + 9 * 3_600_000).toISOString().slice(0, 10);
}

interface StateRow {
  streak_days: number;
  last_active_date: string | null;
  turn_count: number;
  flame_frame: number;
}

/**
 * Per-user session state. Holds the flame inputs (turns, unique concepts,
 * streak) as the single source of truth for the flame level, plus a small
 * rolling buffer of learning notes used as a local memory fallback.
 */
export class FlameSession extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      const sql = this.ctx.storage.sql;
      sql.exec(`CREATE TABLE IF NOT EXISTS state (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        streak_days INTEGER NOT NULL DEFAULT 0,
        last_active_date TEXT,
        turn_count INTEGER NOT NULL DEFAULT 0,
        flame_frame INTEGER NOT NULL DEFAULT 0
      );`);
      sql.exec(`CREATE TABLE IF NOT EXISTS concepts (name TEXT PRIMARY KEY);`);
      sql.exec(`CREATE TABLE IF NOT EXISTS memories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        created_at INTEGER NOT NULL,
        text TEXT NOT NULL
      );`);
      sql.exec(`CREATE TABLE IF NOT EXISTS last_result (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        payload TEXT NOT NULL
      );`);
      sql.exec(`INSERT OR IGNORE INTO state (id) VALUES (1);`);
    });
  }

  private readState(): StateRow {
    return this.ctx.storage.sql
      .exec(`SELECT streak_days, last_active_date, turn_count, flame_frame FROM state WHERE id = 1;`)
      .one() as unknown as StateRow;
  }

  private uniqueConcepts(): number {
    const row = this.ctx.storage.sql.exec(`SELECT COUNT(*) AS n FROM concepts;`).one();
    return Number(row.n);
  }

  /** Record one learning turn and recompute the flame level. */
  ignite(newConcepts: string[]): FlameState {
    const prev = this.readState();
    const today = dateKey(Date.now());
    const yesterday = dateKey(Date.now() - 86_400_000);

    let streak = prev.streak_days;
    if (prev.last_active_date === today) {
      streak = prev.streak_days || 1;
    } else if (prev.last_active_date === yesterday) {
      streak = prev.streak_days + 1;
    } else {
      streak = 1;
    }

    const turnCount = prev.turn_count + 1;

    for (const concept of newConcepts) {
      const name = concept.trim();
      if (name) this.ctx.storage.sql.exec(`INSERT OR IGNORE INTO concepts (name) VALUES (?);`, name);
    }
    const uniqueConcepts = this.uniqueConcepts();

    const score = computeScore(turnCount, uniqueConcepts, streak);
    const frame = scoreToFrame(score);
    const deltaFrame = frame - prev.flame_frame;

    this.ctx.storage.sql.exec(
      `UPDATE state SET streak_days = ?, last_active_date = ?, turn_count = ?, flame_frame = ? WHERE id = 1;`,
      streak,
      today,
      turnCount,
      frame,
    );

    return {
      frame,
      band: frameToBand(frame),
      deltaFrame,
      score,
      streakDays: streak,
      turnCount,
      uniqueConcepts,
    };
  }

  /** Persist a snapshot of the latest ignite result for reload restore. */
  recordResult(payloadJson: string): void {
    this.ctx.storage.sql.exec(
      `INSERT OR REPLACE INTO last_result (id, payload) VALUES (1, ?);`,
      payloadJson,
    );
  }

  /** Read-only current state used to rehydrate the UI after a reload. */
  getState(): StateResponse {
    const prev = this.readState();
    const uniqueConcepts = this.uniqueConcepts();
    const score = computeScore(prev.turn_count, uniqueConcepts, prev.streak_days);

    const flame: FlameState = {
      frame: prev.flame_frame,
      band: frameToBand(prev.flame_frame),
      deltaFrame: 0,
      score,
      streakDays: prev.streak_days,
      turnCount: prev.turn_count,
      uniqueConcepts,
    };

    let last: StoredResult | null = null;
    const row = this.ctx.storage.sql
      .exec(`SELECT payload FROM last_result WHERE id = 1;`)
      .toArray()[0];
    if (row) {
      try {
        last = JSON.parse(String(row.payload)) as StoredResult;
      } catch {
        last = null;
      }
    }

    return { flame, last };
  }

  addMemory(text: string): void {
    const trimmed = text.trim();
    if (!trimmed) return;
    this.ctx.storage.sql.exec(
      `INSERT INTO memories (created_at, text) VALUES (?, ?);`,
      Date.now(),
      trimmed,
    );
    // Keep only the most recent 20 notes.
    this.ctx.storage.sql.exec(
      `DELETE FROM memories WHERE id NOT IN (SELECT id FROM memories ORDER BY id DESC LIMIT 20);`,
    );
  }

  getRecentMemories(limit: number): MemoryNote[] {
    return this.ctx.storage.sql
      .exec(`SELECT text, created_at FROM memories ORDER BY id DESC LIMIT ?;`, limit)
      .toArray()
      .map((r) => ({ text: String(r.text), createdAt: Number(r.created_at) }));
  }
}

export type FlameStub = DurableObjectStub<FlameSession>;

export function getFlameStub(env: Env, userId: string): FlameStub {
  const ns = env.FLAME as DurableObjectNamespace<FlameSession>;
  return ns.get(ns.idFromName(userId));
}
