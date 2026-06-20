import { Hono } from "hono";
import { generateApp } from "./generate.ts";
import { fallbackGenerate } from "./fallback.ts";
import { executePreview } from "./run.ts";
import { readMemory, writeMemory } from "./memory.ts";
import { ensureSchema, logTurn, addConcepts, storeArtifact } from "./db.ts";
import { getFlameStub } from "./state.ts";
import type { IgniteResponse } from "./types.ts";

export { FlameSession } from "./state.ts";

const app = new Hono<{ Bindings: Env }>();

// userId is supplied by the (anonymous) client and used as a storage key and
// memory filter, so constrain it to a safe shape to prevent key/path injection
// and cross-user access via crafted ids.
const USER_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

app.get("/api/health", (c) =>
  c.json({
    ok: true,
    service: "tanebi",
    bindings: {
      ai: Boolean(c.env.AI),
      loader: Boolean(c.env.LOADER),
      aiSearch: Boolean(c.env.AI_SEARCH),
      db: Boolean(c.env.DB),
      flame: Boolean(c.env.FLAME),
    },
  }),
);

app.post("/api/ignite", async (c) => {
  let body: { userId?: unknown; wish?: unknown };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }

  const wish = typeof body.wish === "string" ? body.wish.trim() : "";
  const rawUserId = typeof body.userId === "string" ? body.userId.trim() : "";
  const userId = rawUserId || "anon";

  if (!wish) return c.json({ error: "wish_required" }, 400);
  if (wish.length > 500) return c.json({ error: "wish_too_long" }, 400);
  if (!USER_ID_RE.test(userId)) return c.json({ error: "invalid_user" }, 400);

  try {
    await ensureSchema(c.env);

    // 1) Recall past learning context.
    const memory = await readMemory(c.env, userId, wish);

    // 2) Generate a runnable app (AI with offline fallback).
    const gen = await generateApp(c.env, wish, memory.context);

    // 3) Persist the artifact so the preview endpoint can execute it. Always
    //    store an HTML fallback so the preview can degrade gracefully if the
    //    Dynamic Worker fails or is unavailable (AI outputs have no html of
    //    their own, so synthesize a template one).
    const sessionId = crypto.randomUUID();
    const fallbackHtml = gen.html ?? fallbackGenerate(wish).html;
    try {
      await storeArtifact(c.env, sessionId, userId, gen.code, fallbackHtml);
    } catch (err) {
      console.error("storeArtifact failed:", err);
    }

    // 4) Record the learning into memory (semantic + structured).
    await writeMemory(c.env, c.executionCtx, {
      userId,
      wish,
      explanation: gen.explanation,
      next_spark: gen.next_spark,
      concepts: gen.concepts,
    });
    c.executionCtx.waitUntil(logTurn(c.env, userId, wish, gen.explanation));
    c.executionCtx.waitUntil(addConcepts(c.env, userId, gen.concepts));

    // 5) Update the flame level (Durable Object is the source of truth).
    const flameStub = getFlameStub(c.env, userId);
    const flame = await flameStub.ignite(gen.concepts);

    const response: IgniteResponse = {
      sessionId,
      previewPath: `/api/preview/${sessionId}`,
      explanation: gen.explanation,
      next_spark: gen.next_spark,
      concepts: gen.concepts,
      flame,
      source: gen.source,
      usedMemory: memory.used,
    };

    // 6) Persist a snapshot so the SPA can restore this result after a reload.
    c.executionCtx.waitUntil(
      flameStub.recordResult(
        JSON.stringify({
          sessionId,
          explanation: gen.explanation,
          next_spark: gen.next_spark,
          concepts: gen.concepts,
          source: gen.source,
          usedMemory: memory.used,
        }),
      ),
    );

    return c.json(response);
  } catch (err) {
    console.error("/api/ignite failed:", err);
    return c.json({ error: "ignite_failed" }, 500);
  }
});

app.get("/api/state/:userId", async (c) => {
  const userId = c.req.param("userId").trim() || "anon";
  if (!USER_ID_RE.test(userId)) return c.json({ error: "invalid_user" }, 400);
  try {
    const state = await getFlameStub(c.env, userId).getState();
    return c.json(state);
  } catch (err) {
    console.error("/api/state failed:", err);
    return c.json({ error: "state_failed" }, 500);
  }
});

app.get("/api/preview/:sessionId", async (c) => {
  const sessionId = c.req.param("sessionId");
  return executePreview(c.env, sessionId, c.req.raw);
});

app.all("/api/*", (c) => c.json({ error: "not_found" }, 404));

export default app;
