import { getFlameStub } from "./state.ts";

interface Waiter {
  waitUntil(promise: Promise<unknown>): void;
}

const INSTANCE_ID = "hidane";
const MAX_CONTEXT_NOTES = 3;

interface WriteInput {
  userId: string;
  wish: string;
  explanation: string;
  next_spark: string;
  concepts: string[];
}

function noteMarkdown(input: WriteInput): string {
  return [
    "# 学びの記録",
    `- 願い: ${input.wish}`,
    `- 作ったもの: ${input.explanation}`,
    `- 触れた概念: ${input.concepts.join(", ")}`,
    `- 次の一歩: ${input.next_spark}`,
  ].join("\n");
}

function shortNote(input: WriteInput): string {
  return `「${input.wish}」を作った（概念: ${input.concepts.join("・")}）。次の一歩: ${input.next_spark}`;
}

// `get` only returns a handle (it never throws for a missing instance — real
// failures surface on search/upload), so creation recovery is handled at the
// call sites in uploadToAiSearch/readFromAiSearch.
function getInstance(env: Env) {
  return env.AI_SEARCH.get(INSTANCE_ID);
}

async function uploadToAiSearch(env: Env, input: WriteInput): Promise<void> {
  const instance = getInstance(env);
  const name = `users/${input.userId}/turn-${Date.now()}.md`;
  const options = {
    metadata: {
      userId: input.userId,
      concepts: input.concepts,
      createdAt: Date.now(),
    },
    timeoutMs: 8000,
    pollIntervalMs: 1000,
  };
  try {
    await instance.items.uploadAndPoll(name, noteMarkdown(input), options);
  } catch {
    // If the instance doesn't exist yet, create it and retry once.
    await env.AI_SEARCH.create({ id: INSTANCE_ID }).catch(() => undefined);
    const retry = env.AI_SEARCH.get(INSTANCE_ID);
    await retry.items.uploadAndPoll(name, noteMarkdown(input), options);
  }
}

/**
 * Persist a learning note. The Durable Object write is synchronous and
 * authoritative (guarantees the next turn sees it, and works locally). The AI
 * Search upload provides semantic recall and runs in the background.
 */
export async function writeMemory(
  env: Env,
  ctx: Waiter,
  input: WriteInput,
): Promise<void> {
  try {
    await getFlameStub(env, input.userId).addMemory(shortNote(input));
  } catch (err) {
    console.error("DO memory write failed:", err);
  }

  if (env.AI_SEARCH) {
    ctx.waitUntil(
      uploadToAiSearch(env, input).catch((err) =>
        console.error("AI Search upload failed:", err),
      ),
    );
  }
}

async function readFromAiSearch(env: Env, userId: string, wish: string): Promise<string[]> {
  const instance = getInstance(env);
  const res = await instance.search({
    messages: [{ role: "user", content: wish }],
    ai_search_options: {
      retrieval: {
        max_num_results: MAX_CONTEXT_NOTES,
        filters: { userId: { $eq: userId } } as VectorizeVectorMetadataFilter,
        return_on_failure: true,
      },
    },
  });
  // Defense-in-depth: require BOTH the metadata match and the key prefix, in
  // case the server-side filter is ever ineffective.
  return (res.chunks ?? [])
    .filter(
      (c) =>
        c.item?.metadata?.userId === userId && (c.item?.key ?? "").startsWith(`users/${userId}/`),
    )
    .map((c) => c.text)
    .filter((t): t is string => typeof t === "string" && t.trim().length > 0)
    .slice(0, MAX_CONTEXT_NOTES);
}

async function readFromDurableObject(env: Env, userId: string): Promise<string[]> {
  try {
    const notes = await getFlameStub(env, userId).getRecentMemories(MAX_CONTEXT_NOTES);
    return notes.map((n) => n.text);
  } catch (err) {
    console.error("DO memory read failed:", err);
    return [];
  }
}

/**
 * Retrieve recent learning context for a user. Prefers AI Search (semantic),
 * falls back to the Durable Object rolling buffer.
 */
export async function readMemory(
  env: Env,
  userId: string,
  wish: string,
): Promise<{ context: string; used: boolean }> {
  let notes: string[] = [];

  if (env.AI_SEARCH) {
    try {
      notes = await readFromAiSearch(env, userId, wish);
    } catch (err) {
      console.error("AI Search read failed, falling back:", err);
    }
  }

  if (notes.length === 0) {
    notes = await readFromDurableObject(env, userId);
  }

  return {
    context: notes.map((n, i) => `${i + 1}. ${n}`).join("\n"),
    used: notes.length > 0,
  };
}
