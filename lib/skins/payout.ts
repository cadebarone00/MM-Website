// Set the confirmed season pot here; null means the amount has not been supplied.
export const SKINS_2026_POT_CENTS: number | null = null;

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
