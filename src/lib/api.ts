import type { IgniteResponse, StateResponse } from "./types.ts";

const USER_KEY = "tanebi-user-id";

export function getUserId(): string {
  let id = localStorage.getItem(USER_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(USER_KEY, id);
  }
  return id;
}

export class IgniteError extends Error {}

export async function ignite(userId: string, wish: string): Promise<IgniteResponse> {
  const res = await fetch("/api/ignite", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ userId, wish }),
  });

  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) detail = body.error;
    } catch {
      /* ignore */
    }
    throw new IgniteError(detail);
  }

  return (await res.json()) as IgniteResponse;
}

export async function fetchState(userId: string): Promise<StateResponse | null> {
  try {
    const res = await fetch(`/api/state/${encodeURIComponent(userId)}`);
    if (!res.ok) return null;
    return (await res.json()) as StateResponse;
  } catch {
    return null;
  }
}
