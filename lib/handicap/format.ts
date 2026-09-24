/** A negative calculated index is a plus handicap; differentials retain their mathematical sign. */
export function formatHandicapIndex(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "\u2014";
  const rounded = Math.round(value * 10) / 10;
  return rounded < 0 ? `+${Math.abs(rounded).toFixed(1)}` : rounded.toFixed(1);
}

export function formatDifferential(value: number | null): string {
  return value == null || !Number.isFinite(value) ? "\u2014" : (Math.round(value * 10) / 10).toFixed(1);
}

/** "2026-09-07" -> "Sep 7, 2026". Parses as a local date so the day never shifts with the viewer's timezone. */
export function formatRoundDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** Even par reads "E", over par gets a plus sign, and null (nothing scored yet) is a dash. */
export function formatToPar(toPar: number | null): string {
  if (toPar == null) return "\u2014";
  if (toPar === 0) return "E";
  return toPar > 0 ? `+${toPar}` : `${toPar}`;
}
