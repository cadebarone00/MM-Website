import type { HoleEntry, Pairing, PlayerRounds, RoundState, ScorekeeperResult } from "./types";

async function callScorekeeper(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const url = process.env.LIVE_FEED_URL;
  const secret = process.env.SCOREKEEPER_SERVER_SECRET;
  if (!url) throw new Error("not configured");
  if (!secret) throw new Error("not configured");

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, serverSecret: secret }),
  });
  if (!res.ok) throw new Error(`Scoring backend responded with ${res.status}`);
  return (await res.json()) as Record<string, unknown>;
}

async function safeCall(body: Record<string, unknown>): Promise<Record<string, unknown> | { __error: string }> {
  try {
    return await callScorekeeper(body);
  } catch (err) {
    const message = err instanceof Error && err.message === "not configured" ? "Scoring server is not configured yet." : "Could not reach the scoring system.";
    return { __error: message };
  }
}

export async function getPlayerRounds(player: string): Promise<ScorekeeperResult<{ rounds: PlayerRounds[]; waiting?: string }>> {
  const data = await safeCall({ type: "playerGetRounds", player });
  if ("__error" in data) return { ok: false, error: (data as { __error: string }).__error };
  if (data.valid !== true) return { ok: false, error: (String((data as Record<string, unknown>).error ?? "Could not load your rounds.")) as string };
  return { ok: true, rounds: (data.rounds as PlayerRounds[]) ?? [], waiting: typeof data.waiting === "string" ? (data.waiting as string) : undefined };
}

export async function submitHoleAsPlayer(
  player: string,
  round: number,
  target: "self" | "partner",
  hole: number,
  score: number,
  putts: number,
  fir: boolean,
  gir: boolean
): Promise<ScorekeeperResult<Record<string, never>>> {
  const data = await safeCall({ type: "playerSubmitHole", player, round, target, hole, score, putts, fir, gir });
  if ("__error" in data) return { ok: false, error: (data as { __error: string }).__error };
  if (data.saved !== true) return { ok: false, error: (String((data as Record<string, unknown>).error ?? "Could not save that hole.")) as string };
  return { ok: true } as ScorekeeperResult<Record<string, never>>;
}

export async function getHostData(): Promise<
  ScorekeeperResult<{ roster: { maroon: string[]; white: string[] }; pairings: Pairing[]; roundState: RoundState[] }>
> {
  const data = await safeCall({ type: "hostGetData" });
  if ("__error" in data) return { ok: false, error: (data as { __error: string }).__error };
  if (data.ok !== true) return { ok: false, error: (String((data as Record<string, unknown>).error ?? "Could not load host data.")) as string };
  return {
    ok: true,
    roster: (data.roster as { maroon: string[]; white: string[] }) ?? { maroon: [], white: [] },
    pairings: (data.pairings as Pairing[]) ?? [],
    roundState: (data.roundState as RoundState[]) ?? [],
  };
}

export async function getHostPlayerRound(player: string, round: number): Promise<ScorekeeperResult<{ holes: HoleEntry[] }>> {
  const data = await safeCall({ type: "hostGetPlayerRound", player, round });
  if ("__error" in data) return { ok: false, error: (data as { __error: string }).__error };
  if (data.ok !== true) return { ok: false, error: (String((data as Record<string, unknown>).error ?? "Could not load that scorecard.")) as string };
  return { ok: true, holes: (data.holes as HoleEntry[]) ?? [] };
}

export async function submitHoleAsHost(
  player: string,
  round: number,
  hole: number,
  score: number,
  putts: number,
  fir: boolean,
  gir: boolean
): Promise<ScorekeeperResult<Record<string, never>>> {
  const data = await safeCall({ type: "hostSubmitHole", player, round, hole, score, putts, fir, gir });
  if ("__error" in data) return { ok: false, error: (data as { __error: string }).__error };
  if (data.saved !== true) return { ok: false, error: (String((data as Record<string, unknown>).error ?? "Could not save that hole.")) as string };
  return { ok: true } as ScorekeeperResult<Record<string, never>>;
}

export async function setPairings(
  round: number,
  session: string,
  format: string,
  maroonPlayers: string[],
  whitePlayers: string[]
): Promise<ScorekeeperResult<Record<string, never>>> {
  const data = await safeCall({ type: "hostSetPairings", round, session, format, maroonPlayers, whitePlayers });
  if ("__error" in data) return { ok: false, error: (data as { __error: string }).__error };
  if (data.ok !== true) return { ok: false, error: String(data.error ?? "Could not save that pairing.") as string };
  return { ok: true } as ScorekeeperResult<Record<string, never>>;
}

export async function deletePairing(row: number): Promise<ScorekeeperResult<Record<string, never>>> {
  const data = await safeCall({ type: "hostDeletePairing", row });
  if ("__error" in data) return { ok: false, error: (data as { __error: string }).__error };
  if (data.ok !== true) return { ok: false, error: String(data.error ?? "Could not delete that pairing.") as string };
  return { ok: true } as ScorekeeperResult<Record<string, never>>;
}

export async function startRound(round: number): Promise<ScorekeeperResult<Record<string, never>>> {
  const data = await safeCall({ type: "hostStartRound", round });
  if ("__error" in data) return { ok: false, error: (data as { __error: string }).__error };
  if (data.ok !== true) return { ok: false, error: String(data.error ?? "Could not start that round.") as string };
  return { ok: true } as ScorekeeperResult<Record<string, never>>;
}

export async function resetRound(round: number): Promise<ScorekeeperResult<Record<string, never>>> {
  const data = await safeCall({ type: "hostResetRound", round });
  if ("__error" in data) return { ok: false, error: (data as { __error: string }).__error };
  if (data.ok !== true) return { ok: false, error: String(data.error ?? "Could not reset that round.") as string };
  return { ok: true } as ScorekeeperResult<Record<string, never>>;
}
