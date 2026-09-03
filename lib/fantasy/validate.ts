import type { Tournament } from "@/lib/data/types";
import type { FantasyPicks } from "./scoring";

export type ValidatedPicks = { ok: true; picks: FantasyPicks } | { ok: false; error: string };

/**
 * Server-side validation for a fantasy team submission: all three picks
 * present, each on the roster it's supposed to be on, and no player reused
 * across slots (including the wildcard, which may otherwise come from
 * either team).
 */
export function validateFantasyPicks(tournament: Tournament, input: Partial<Record<keyof FantasyPicks, unknown>>): ValidatedPicks {
  const maroonPlayer = typeof input.maroonPlayer === "string" ? input.maroonPlayer : null;
  const whitePlayer = typeof input.whitePlayer === "string" ? input.whitePlayer : null;
  const wildcardPlayer = typeof input.wildcardPlayer === "string" ? input.wildcardPlayer : null;

  if (!maroonPlayer || !whitePlayer || !wildcardPlayer) {
    return { ok: false, error: "Pick all three players before saving." };
  }

  const maroonRoster = tournament.roster.maroon.map((p) => p.toLowerCase());
  const whiteRoster = tournament.roster.white.map((p) => p.toLowerCase());

  if (!maroonRoster.includes(maroonPlayer.toLowerCase())) {
    return { ok: false, error: "Your Maroon pick must be a Team Maroon player." };
  }
  if (!whiteRoster.includes(whitePlayer.toLowerCase())) {
    return { ok: false, error: "Your White pick must be a Team White player." };
  }
  if (!maroonRoster.includes(wildcardPlayer.toLowerCase()) && !whiteRoster.includes(wildcardPlayer.toLowerCase())) {
    return { ok: false, error: "Your Wildcard pick must be on the tournament roster." };
  }

  const distinct = new Set([maroonPlayer.toLowerCase(), whitePlayer.toLowerCase(), wildcardPlayer.toLowerCase()]);
  if (distinct.size !== 3) {
    return { ok: false, error: "All three picks must be different players." };
  }

  return { ok: true, picks: { maroonPlayer, whitePlayer, wildcardPlayer } };
}
