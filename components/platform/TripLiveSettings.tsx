"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { liveSettingsFrom, LIVE_VISIBILITY_COPY } from "@/lib/platform/liveVisibility";
import type { SavedGolfTrip } from "@/lib/platform/golfTripCreate";
import { LiveVisibilityPicker } from "./LiveVisibilityPicker";
import { TripTapInInvite } from "./TripTapInInvite";
import styles from "./CodeTournament.module.css";

/**
 * Trip Settings → Members: The Maroon Live. The organizer picks who can watch (Public / Link only / Private) and
 * whether players can share the link. Everyone allowed to share sees the link; the server leaves the watch code out
 * for everyone else (lib/platform/golfTripsServer.ts), so the link simply isn't shown.
 */
export function TripLiveSettings({ trip, isOrganizer }: { trip: SavedGolfTrip; isOrganizer: boolean }) {
  const router = useRouter();
  const [problem, setProblem] = useState<string | null>(null);
  const settings = liveSettingsFrom(trip.trip.live_visibility, trip.trip.live_players_can_share, "link");
  const code = trip.trip.watch_code;
  async function save(next: typeof settings) {
    const reply = await fetch(`/api/golf-trips/${encodeURIComponent(trip.trip.id)}/live`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(next) })
      .then((r) => r.json() as Promise<{ ok: boolean; error?: string }>).catch(() => ({ ok: false, error: "Couldn't save. Check your connection." }));
    setProblem(reply.ok ? null : reply.error ?? "Couldn't save. Try again.");
    if (reply.ok) router.refresh();
    return reply.ok;
  }
  return <>
    {isOrganizer && <>
      <h2 className={styles.cutBlurb}><b>Who can watch: {LIVE_VISIBILITY_COPY[settings.visibility].label}</b></h2>
      {problem && <p className={styles.status} role="alert">{problem}</p>}
      <LiveVisibilityPicker key={`${settings.visibility}|${settings.playersCanShare}`} settings={settings} onChange={save} />
    </>}
    {code && <TripTapInInvite code={code} name={trip.trip.name} />}
  </>;
}
