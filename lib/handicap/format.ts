/** A negative calculated index is a plus handicap; differentials retain their mathematical sign. */
export function formatHandicapIndex(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "\u2014";
  const rounded = Math.round(value * 10) / 10;
  return rounded < 0 ? `+${Math.abs(rounded).toFixed(1)}` : rounded.toFixed(1);
}

export function formatDifferential(value: number | null): string {
  return value == null || !Number.isFinite(value) ? "\u2014" : (Math.round(value * 10) / 10).toFixed(1);
}
