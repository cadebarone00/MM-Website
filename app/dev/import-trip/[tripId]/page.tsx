import Link from "next/link";
import { notFound } from "next/navigation";
import { ImportedGolfTripHome } from "@/components/platform/ImportedGolfTripHome";
import { samplePastTrip, samplePastTripResults, samplePastTripRevision } from "@/lib/dev/samplePastTrips";
import { importedTripView } from "@/lib/platform/importedTripPresentation";

export const dynamic = "force-dynamic";

/**
 * App simulator: a sample imported trip, the same page a real one gets (kept in the dev server's memory only).
 * `?as=player` views it as the first other player, as if they'd linked their account (Edit my scores).
 */
export default async function SampleImportedTrip({ params, searchParams }: { params: Promise<{ tripId: string }>; searchParams: Promise<{ as?: string }> }) {
  const { tripId } = await params;
  const asPlayer = (await searchParams).as === "player";
  const trip = samplePastTrip(tripId), results = samplePastTripResults(tripId);
  if (!trip || !results) notFound();
  const organizer = trip.members.find((m) => m.role === "organizer")!;
  const viewer = asPlayer ? results.players.find((p) => p.id !== organizer.id) : null;
  const memberId = viewer?.id ?? organizer.id;
  return <>
    <ImportedGolfTripHome savedTrip={trip} view={importedTripView(results, trip.members)} backHref="/dev/import-trip" settingsHref={null}
      editing={{ imported: results, revision: samplePastTripRevision(tripId), memberId, organizer: !viewer,
        endpoint: `/api/dev/past-trip-import/${tripId}${viewer ? `?as=${viewer.id}` : ""}` }} />
    <p style={{ margin: 0, padding: "12px 16px 120px", textAlign: "center", fontSize: 13, background: "#f3f0eb", color: "var(--color-maroon-800)" }}>
      Simulator: viewing as {viewer ? `${viewer.name} (a player)` : "the organizer"} ·{" "}
      <Link href={`/dev/import-trip/${tripId}${viewer ? "" : "?as=player"}`}>{viewer ? "View as the organizer" : "View as a player"}</Link>
    </p>
  </>;
}
