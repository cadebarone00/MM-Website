"use client";

import { useState } from "react";
import { DeleteAccountFlow, type DeletionActions, type DeletionPreviewData } from "@/components/settings/DeleteAccountFlow";

/** DEV ONLY: the real Delete account screen on sample data. Nothing is sent anywhere; answers are simulated. */
const SAMPLE: DeletionPreviewData = {
  trips: [
    { tripId: "t-active", name: "Pinehurst Spring Trip", startDate: "2027-04-22", endDate: "2027-04-26", ended: false, outcome: "restrict", handoff: null,
      eligible: [{ memberId: "m-sam", name: "Sam Patel" }, { memberId: "m-riley", name: "Riley Foster" }] },
    { tripId: "t-given", name: "Scottsdale Fall Trip", startDate: "2027-10-08", endDate: "2027-10-11", ended: false, outcome: "transfer",
      handoff: { toName: "Avery Jensen", state: "accepted" }, eligible: [{ memberId: "m-avery", name: "Avery Jensen" }] },
    { tripId: "t-past", name: "Bandon Dunes 2025", startDate: "2025-05-14", endDate: "2025-05-18", ended: true, outcome: "archive", handoff: null, eligible: [] },
  ],
  counts: { tripsJoined: 2, sharedRoundsHosted: 0, tournamentRoles: 1, legacyPlayer: true, personalRounds: 6, sharedRounds: 11, scorecards: 11, openBets: 1, files: 1 },
};

export function DevDeleteAccountPreview({ outcome }: { outcome: "completed" | "closed" | "wrong-password" }) {
  const [data, setData] = useState(SAMPLE);
  const actions: DeletionActions = {
    async refresh() { return data; },
    async offer(tripId, memberId) {
      const trip = data.trips.find((t) => t.tripId === tripId);
      const name = trip?.eligible.find((m) => m.memberId === memberId)?.name ?? "A member";
      const next = { ...data, trips: data.trips.map((t) => t.tripId === tripId ? { ...t, handoff: { toName: name, state: "pending" as const } } : t) };
      setData(next);
      return null;
    },
    async withdraw(tripId) {
      setData({ ...data, trips: data.trips.map((t) => t.tripId === tripId ? { ...t, handoff: null } : t) });
      return null;
    },
    async remove() {
      await new Promise((r) => setTimeout(r, 900));
      if (outcome === "wrong-password") return { error: "That password isn't right." };
      return { state: outcome === "completed" ? "completed" : "storage_done" };
    },
  };
  return <DeleteAccountFlow key={JSON.stringify(data)} initial={data} actions={actions} />;
}
