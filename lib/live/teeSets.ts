import type { LiveTeeSet } from "./types";

export function validTeeSets(value: unknown): value is LiveTeeSet[] {
  if (!Array.isArray(value) || !value.length) return false;
  const ids = new Set<string>();
  return value.every((tee) => {
    if (!tee || typeof tee.id !== "string" || !tee.id.trim() || ids.has(tee.id) || typeof tee.name !== "string" || !tee.name.trim()) return false;
    ids.add(tee.id);
    if (tee.color !== undefined && (typeof tee.color !== "string" || !/^#[0-9a-f]{6}$/i.test(tee.color))) return false;
    if (tee.locked !== undefined && typeof tee.locked !== "boolean") return false;
    if (tee.rating != null && (!Number.isFinite(tee.rating) || tee.rating <= 0)) return false;
    if (tee.slope != null && (!Number.isInteger(tee.slope) || tee.slope < 55 || tee.slope > 155)) return false;
    if (!Array.isArray(tee.holes) || tee.holes.length !== 18) return false;
    const numbers = new Set<number>();
    if (!tee.holes.every((hole: LiveTeeSet["holes"][number]) => {
      if (!hole || !Number.isInteger(hole.number) || hole.number < 1 || hole.number > 18 || numbers.has(hole.number)) return false;
      numbers.add(hole.number);
      return Number.isInteger(hole.par) && (hole.par === 0 && !tee.locked || hole.par >= 3 && hole.par <= 6) && Number.isInteger(hole.yards) && hole.yards >= 0;
    })) return false;
    return !tee.locked || (tee.rating != null && tee.slope != null && tee.holes.every((hole: LiveTeeSet["holes"][number]) => hole.yards > 0));
  });
}

export function availableTeeSets(tees: LiveTeeSet[] | undefined): LiveTeeSet[] {
  return (tees ?? []).filter((tee) => validTeeSets([tee]) && tee.locked === true);
}
