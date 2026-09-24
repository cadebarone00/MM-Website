export function skinsScoreLabel(score: number, par: number | null): string {
  if (par == null) return "Par unavailable";
  const diff = score - par;
  if (diff === 0) return "Par";
  if (diff === -1) return "Birdie";
  if (diff === -2) return "Eagle";
  if (diff === -3) return "Albatross";
  if (diff === 1) return "Bogey";
  if (diff === 2) return "Double bogey";
  if (diff === 3) return "Triple bogey";
  return `${Math.abs(diff)} ${diff < 0 ? "under" : "over"} par`;
}
