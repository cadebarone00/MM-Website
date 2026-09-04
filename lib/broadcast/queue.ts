// lib/broadcast/queue.ts
//
// The single "next in queue" query (master spec §12): active rows for a
// season, ordered by effective (aged) priority desc, then created_at asc.
// sortQueueRows is pure/testable; getNextInQueue is the thin I/O wrapper —
// unused by any caller until Phase 4 reads the queue, written now so that
// phase doesn't redefine ordering a second time. Server-only (getNextInQueue
// pulls in @/lib/supabase/server via next/headers, same rule as
// lib/broadcast/state.ts).
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { effectivePriority } from "./priority";
import type { BroadcastEventKind, BroadcastEventStatus } from "./types";

export interface BroadcastEventRow {
  id: string;
  kind: BroadcastEventKind;
  priority: number;
  status: BroadcastEventStatus;
  payload: Record<string, unknown>;
  expiresAt: string | null;
  createdAt: string;
}

/** Active (queued/ready), unexpired rows, ordered by aged priority desc then created_at asc. Pure — no I/O. */
export function sortQueueRows(rows: BroadcastEventRow[], now: Date): BroadcastEventRow[] {
  return rows
    .filter((row) => (row.status === "queued" || row.status === "ready") && (!row.expiresAt || new Date(row.expiresAt) > now))
    .sort((a, b) => {
      const diff = effectivePriority(b.priority, b.createdAt, now) - effectivePriority(a.priority, a.createdAt, now);
      return diff !== 0 ? diff : new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });
}

export async function getNextInQueue(seasonYear: number): Promise<BroadcastEventRow[]> {
  const service = createSupabaseServiceRoleClient();
  const { data, error } = await service
    .from("broadcast_events")
    .select("id, kind, priority, status, payload, expires_at, created_at")
    .eq("season_year", seasonYear)
    .in("status", ["queued", "ready"]);

  if (error) {
    console.error("broadcast_events queue read failed:", error.message);
    return [];
  }

  const rows: BroadcastEventRow[] = (data ?? []).map((r) => ({
    id: r.id,
    kind: r.kind as BroadcastEventKind,
    priority: r.priority,
    status: r.status as BroadcastEventStatus,
    payload: r.payload as Record<string, unknown>,
    expiresAt: r.expires_at,
    createdAt: r.created_at,
  }));
  return sortQueueRows(rows, new Date());
}
