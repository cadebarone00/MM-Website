export type Area = "website" | "portal" | "scoring" | "tiger";
export type AreaHistory = Partial<Record<Area, string[]>>;
export const areaHomes: Record<Area, string> = { website: "/", portal: "/portal", scoring: "/portal/scoring", tiger: "/portal/admin" };
export function navigationArea(path: string): Area {
  if (path === "/portal/scoring" || path.startsWith("/portal/scoring/")) return "scoring";
  if (path === "/portal/admin" || path.startsWith("/portal/admin/")) return "tiger";
  if (path === "/portal" || path.startsWith("/portal/")) return "portal";
  return "website";
}
export function visitArea(history: AreaHistory, path: string): AreaHistory {
  const area = navigationArea(path), trail = history[area] ?? [];
  if (trail.at(-1) === path) return history;
  return { ...history, [area]: [...trail, path].slice(-100) };
}
export function areaBack(history: AreaHistory, path: string): string {
  const area = navigationArea(path), trail = history[area] ?? [];
  const previous = trail.at(-1) === path ? trail.at(-2) : trail.at(-1);
  return previous && previous.startsWith("/") && !previous.startsWith("//") && navigationArea(previous) === area ? previous : areaHomes[area];
}
export function popArea(history: AreaHistory, path: string): AreaHistory {
  const area = navigationArea(path), trail = history[area] ?? [];
  return { ...history, [area]: trail.at(-1) === path ? trail.slice(0, -1) : trail };
}
