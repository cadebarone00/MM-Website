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

// Historical aliases are accepted on reads; new records always use the profile slug.
const legacyAliases: Record<string, string> = {
  "cade": "cade-barone",
  "cam": "cam-latto",
  "collin": "collin-ross",
  "dalton": "dalton-spriggs",
  "drew": "drew-weisser",
  "hugo": "hugo-moebel",
  "jackson": "jackson-collins",
  "kyle": "kyle-schnabel",
  "luke": "luke-sherrell",
  "nate": "nate-wojciechowski",
  "pete": "pete-peabody",
  "peyton": "peyton-vos",
  "quez": "quez-currier"
};

const byId = new Map(playerProfiles.map((profile) => [profile.id.toLowerCase(), profile]));
const bySlug = new Map(playerProfiles.map((profile) => [profile.slug, profile]));
const byFullName = new Map(playerProfiles.map((profile) => [profile.fullName.toLowerCase(), profile]));

export function getPlayerProfile(player: string): PlayerProfile | undefined {
  const key = player.trim().toLowerCase();
  return byId.get(key) ?? bySlug.get(key) ?? byFullName.get(key) ?? bySlug.get(legacyAliases[key]);
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
