"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { isGolfTripId } from "./golfTripCreate";
import { readGolfTripDraft, saveGolfTripDraft } from "./golfTripDraft";
import { tripBuilderSetupValues } from "./tripBuilderSetup";

export type CreateState = { status: "idle" | "creating" } | { status: "created"; tripId: string; url: string }
  | { status: "error"; message: string; needsLogin: boolean };

/**
 * Create Golf Trip from the questionnaire draft. The request id kept in the draft makes a double tap or a retry
 * return the same trip; a failed save leaves every answer in place. Trip Builder's competition answers are then
 * saved into the trip's Settings (a failure there doesn't stop the trip; the organizer can set it in Settings).
 */
export function useCreateGolfTrip() {
  const router = useRouter();
  const [state, setState] = useState<CreateState>({ status: "idle" });
  const inFlight = useRef(false);
  // Used only when this browser blocks storage, so retries still reuse one id.
  const fallbackRequestId = useRef<string | null>(null);

  async function createTrip() {
    if (inFlight.current) return;
    inFlight.current = true;
    setState({ status: "creating" });

    const answers = readGolfTripDraft();
    if (!answers.requestId) {
      answers.requestId = fallbackRequestId.current ??= crypto.randomUUID();
      saveGolfTripDraft({ requestId: answers.requestId });
    }

    try {
      const response = await fetch("/api/golf-trips", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(answers) });
      const result: unknown = await response.json().catch(() => null);
      const { ok, tripId, url, error } = (result ?? {}) as { ok?: boolean; tripId?: unknown; url?: unknown; error?: unknown };
      if (response.ok && ok && typeof url === "string") {
        // Stays locked (inFlight) from here until the trip opens.
        if (typeof tripId === "string" && isGolfTripId(tripId)) {
          await saveCompetition(tripId, answers);
          setState({ status: "created", tripId, url });
        } else router.replace(url);
        return;
      }
      setState({ status: "error", needsLogin: response.status === 401,
        message: typeof error === "string" ? error : "We couldn't create your trip. Your answers are still here, so try again." });
    } catch {
      setState({ status: "error", needsLogin: false, message: "Couldn't reach the server. Check your connection and try again. Your answers are still here." });
    }
    inFlight.current = false;
  }

  return { state, createTrip };
}

async function saveCompetition(tripId: string, answers: Record<string, string>) {
  const values = tripBuilderSetupValues(answers);
  if (!values) return;
  try {
    const response = await fetch(`/api/golf-trips/${tripId}/setup`, { method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ values, revision: 0, writeId: crypto.randomUUID() }) });
    if (!response.ok) console.warn("Trip Builder: competition settings weren't saved", response.status);
  } catch (error) {
    console.warn("Trip Builder: competition settings weren't saved", error);
  }
}
