import type { SkinWin } from "./calculate";

export const SKINS_2026_ENTRY_CENTS = 10_000;
export const SKINS_2026_ROUND_POT_CENTS = 20_000;

/** Each eligible session has its own pot; the season earnings are the sum of those shares. */
export function calculateRoundPayouts(players: string[], wins: SkinWin[], eligibleRounds: number[]) {
  const earnings = Object.fromEntries(players.map((player) => [player, 0]));
  const rounds = [...new Set(eligibleRounds)].sort((a, b) => a - b).map((round) => {
    const roundWins = wins.filter((win) => win.round === round);
    const totals: Record<string, number> = {};
    for (const win of roundWins) totals[win.player] = (totals[win.player] ?? 0) + 1;
    const shares = calculateSkinsPayouts(totals, SKINS_2026_ROUND_POT_CENTS);
    for (const [player, cents] of Object.entries(shares ?? {})) earnings[player] = (earnings[player] ?? 0) + cents;
    return { round, skins: roundWins.length, potCents: SKINS_2026_ROUND_POT_CENTS,
      perSkinCents: roundWins.length ? SKINS_2026_ROUND_POT_CENTS / roundWins.length : null };
  });
  return { earnings, rounds };
}

/** Split the whole pot proportionally, allocating leftover cents by largest remainder. */
export function calculateSkinsPayouts(totals: Record<string, number>, potCents: number | null): Record<string, number> | null {
  const totalSkins = Object.values(totals).reduce((sum, count) => sum + count, 0);
  if (potCents == null || !Number.isSafeInteger(potCents) || potCents < 0 || totalSkins === 0) return null;
  const shares = Object.entries(totals).map(([player, count]) => ({
    player, cents: Math.floor(potCents * count / totalSkins), remainder: (potCents * count) % totalSkins,
  })).sort((a, b) => b.remainder - a.remainder || a.player.localeCompare(b.player));
  const leftover = potCents - shares.reduce((sum, share) => sum + share.cents, 0);
  for (let index = 0; index < leftover; index++) shares[index].cents++;
  return Object.fromEntries(shares.map(({ player, cents }) => [player, cents]));
}

export function formatSkinsMoney(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}
