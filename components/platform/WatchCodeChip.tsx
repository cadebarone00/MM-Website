"use client";
import { TripTapInInvite } from "./TripTapInInvite";
/** Existing settings entry now shares the canonical Tap In link, using the same watch capability. */
export function WatchCodeChip({ code, name }: { code: string; name: string }) {
  return <TripTapInInvite code={code} name={name} />;
}
