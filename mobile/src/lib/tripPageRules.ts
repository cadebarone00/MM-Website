import type { JoinLink } from "@/lib/platform/golfTripJoinLinks";
import type { TripHomeData } from "@/lib/platform/tripHome";

// The trip page's rules (project_specs.md Golf Trips part 2c), with no phone code so they can be tested.

/** The server's trip page data (lib/platform/tripPageData.ts, which is server-only, so the shape is restated here). */
export type TripPageData = { status: "signed-out" } | { status: "not-found" } | { status: "imported"; savedTrip: { trip: { name: string } } } | ({ status: "live" } & TripHomeData);

/** What the trip page shows (project_specs.md Golf Trips part 2c): loading, the trip, an imported trip, or a problem. */
export type TripPageState =
  | { kind: "loading" }
  | { kind: "live"; data: Extract<TripPageData, { status: "live" }> }
  | { kind: "imported"; name: string }
  | { kind: "not-found" }
  | { kind: "signed-out" }
  | { kind: "error"; message: string };

const NOT_FOUND = "Trip not found.";
const SIGNED_OUT = /sign in/i;

/** The server's answer for /api/app/golf-trips/<id> as a page state. */
export function tripPageState(result: { ok: true; data: TripPageData } | { ok: false; error: string }): TripPageState {
  if (!result.ok) {
    if (result.error === NOT_FOUND) return { kind: "not-found" };
    if (SIGNED_OUT.test(result.error)) return { kind: "signed-out" };
    return { kind: "error", message: result.error };
  }
  const data = result.data;
  if (data.status === "live") return { kind: "live", data };
  if (data.status === "imported") return { kind: "imported", name: data.savedTrip.trip.name };
  if (data.status === "signed-out") return { kind: "signed-out" };
  return { kind: "not-found" };
}

/** Home's invite box (website TripHomeInvite + useTripJoinLink): the trip's 30-minute link, fetched again on Copy. */
export type InviteLinkState = { status: "loading" } | { status: "ok"; link: JoinLink } | { status: "off" } | { status: "error"; message: string };

export function inviteLinkState(status: number, body: (Partial<JoinLink> & { error?: string }) | null): InviteLinkState {
  if (status >= 200 && status < 300 && body?.url && body.code) return { status: "ok", link: body as JoinLink };
  if (status === 503) return { status: "off" };
  if (status === 0) return { status: "error", message: "Couldn't reach The Maroon. Check your connection." };
  return { status: "error", message: body?.error || "Couldn't get the invite link. Try again." };
}

