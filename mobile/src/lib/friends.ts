import { apiJson } from "./api.ts";
import type { Relation } from "./friendsUi.ts";

export * from "./friendsUi.ts";

/** Ask to be friends (or accept, if they'd already asked): POST /api/profile/friends { to }. */
export async function befriend(profileId: string): Promise<{ ok: true; relation: Relation } | { ok: false; error: string }> {
  const reply = await apiJson<{ relation?: Relation }>("/api/profile/friends", { method: "POST", body: { to: profileId } });
  return reply.ok ? { ok: true, relation: reply.body.relation ?? "requested" } : { ok: false, error: reply.error || "Couldn't send that. Try again." };
}

/** Stop being friends / take back a request: POST /api/profile/friends { remove }. */
export async function unfriend(profileId: string): Promise<{ ok: true; relation: Relation } | { ok: false; error: string }> {
  const reply = await apiJson<{ relation?: Relation }>("/api/profile/friends", { method: "POST", body: { remove: profileId } });
  return reply.ok ? { ok: true, relation: reply.body.relation ?? "none" } : { ok: false, error: reply.error || "No connection. Try again." };
}

/** Answer a friend request: POST /api/profile/friends { request, accept }. */
export async function answerRequest(requestId: string, accept: boolean): Promise<{ ok: boolean; error?: string }> {
  const reply = await apiJson("/api/profile/friends", { method: "POST", body: { request: requestId, accept } });
  return reply.ok ? { ok: true } : { ok: false, error: reply.error || "Couldn't answer that. Try again." };
}
