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

const byId = new Map(playerProfiles.map((profile) => [profile.id.toLowerCase(), profile]));
const bySlug = new Map(playerProfiles.map((profile) => [profile.slug, profile]));
const byFullName = new Map(playerProfiles.map((profile) => [profile.fullName.toLowerCase(), profile]));

export function getPlayerProfile(player: string): PlayerProfile | undefined {
  const key = player.toLowerCase();
  return byId.get(key) ?? bySlug.get(key) ?? byFullName.get(key);
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
