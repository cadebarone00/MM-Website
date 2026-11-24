import { cardVersion, submissionCheck, submitBodyFrom, submitRefusal, submitResultFromJson } from "@/lib/platform/tripSubmission";
import { myScoringSeat, type TripRoundScoring } from "@/lib/platform/tripScoring";

type Engine = { sync(): Promise<void>; status(): "pending" | "conflict" | "synced"; ops(): { status: string }[] };
type Response = { status: number; body: unknown };
type Request = (path: string, init: { method: "POST"; body: unknown }) => Promise<Response>;

/** Submit only a freshly loaded, fully synchronized card belonging to this account. */
export async function submitTripCard(input: { engine: Engine; tripId: string; profileId: string; refresh: () => Promise<TripRoundScoring | null>; request: Request; correctionHoles?: number[] }): Promise<{ ok: boolean; message: string }> {
  try {
    await input.engine.sync();
    if (input.engine.status() !== "synced" || input.engine.ops().length) return { ok: false, message: "Resolve or sync your score changes before submitting." };
    const scoring = await input.refresh();
    if (!scoring) return { ok: false, message: "Couldn't refresh your card. Try again when you're online." };
    if (input.engine.status() !== "synced" || input.engine.ops().length) return { ok: false, message: "Resolve or sync your score changes before submitting." };
    const check = submissionCheck(scoring, input.profileId, input.profileId, input.correctionHoles);
    if (!check.ok) {
      const message = "holes" in check ? submitRefusal({ status: "rejected", reason: check.reason, holes: check.holes, scoring: null }) : "This card cannot be submitted without an attester.";
      return { ok: false, message };
    }
    if (check.alreadySubmitted) return { ok: true, message: "Your card was already submitted." };
    const seat = myScoringSeat(scoring, input.profileId);
    if (!seat) return { ok: false, message: "Couldn't find your scoring group." };
    const response = await input.request(`/api/golf-trips/${encodeURIComponent(input.tripId)}/scoring/submit`, { method: "POST", body: submitBodyFrom(seat.groupId, input.profileId, cardVersion(scoring, input.profileId)) });
    const body = response.body && typeof response.body === "object" ? response.body as { ok?: boolean; error?: string } : null;
    if (response.status < 200 || response.status >= 300 || !body?.ok) return { ok: false, message: body?.error || "Couldn't submit your card. Try again." };
    const result = submitResultFromJson(response.body);
    if (!result) return { ok: false, message: "Couldn't confirm submission. Refresh your card and try again." };
    if (result.status === "rejected") return { ok: false, message: submitRefusal(result) };
    return { ok: true, message: "Your card was submitted." };
  } catch { return { ok: false, message: "Couldn't submit your card. Try again when you're online." }; }
}
