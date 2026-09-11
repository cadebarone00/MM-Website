import { createPlayerResolver } from "./resolvePlayer";
import { cadeBarone } from "./cade-barone";
import { camLatto } from "./cam-latto";
import { collinRoss } from "./collin-ross";
import { daltonSpriggs } from "./dalton-spriggs";
import { drewWeisser } from "./drew-weisser";
import { hugoMoebel } from "./hugo-moebel";
import { jacksonCollins } from "./jackson-collins";
import { kyleSchnabel } from "./kyle-schnabel";
import { lukeSherrell } from "./luke-sherrell";
import { nateWojciechowski } from "./nate-wojciechowski";
import { petePeabody } from "./pete-peabody";
import { peytonVos } from "./peyton-vos";
import { quezCurrier } from "./quez-currier";
import type { PlayerProfile } from "../types";

export const playerProfiles: PlayerProfile[] = [
  cadeBarone,
  camLatto,
  collinRoss,
  daltonSpriggs,
  drewWeisser,
  hugoMoebel,
  jacksonCollins,
  kyleSchnabel,
  lukeSherrell,
  nateWojciechowski,
  petePeabody,
  peytonVos,
  quezCurrier,
];

const resolvePlayer = createPlayerResolver(playerProfiles);
const bySlug = new Map(playerProfiles.map((profile) => [profile.slug, profile]));

export function getPlayerProfile(player: string): PlayerProfile | undefined {
  return resolvePlayer(player);
}

export function getPlayerProfileBySlug(slug: string): PlayerProfile | undefined {
  return bySlug.get(slug);
}

export function getPlayerDisplayName(player: string): string {
  return getPlayerProfile(player)?.fullName ?? player;
}

export function getPlayerAvatar(player: string): string | null {
  return getPlayerProfile(player)?.avatarSrc ?? null;
}

/** Canonical identifier for joins, URLs, and persisted player references. */
export function getPlayerSlug(player: string): string {
  return getPlayerProfile(player)?.slug ?? player.trim().toLowerCase();
}

/** Imports must not introduce an unrecognized or ambiguous player identifier. */
export function requirePlayerSlug(player: string): string {
  const profile = getPlayerProfile(player);
  if (!profile) throw new Error(`Unknown player: ${player}`);
  return profile.slug;
}

export function getPlayerFirstName(player: string): string {
  return getPlayerDisplayName(player).split(" ")[0];
}

export function getPlayerLastName(player: string): string {
  return getPlayerDisplayName(player).split(" ").at(-1) ?? player;
}
