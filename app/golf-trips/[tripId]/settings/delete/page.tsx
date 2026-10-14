import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getGolfTrip } from "@/lib/platform/golfTripsServer";
import { DeleteTrip } from "@/components/platform/GolfTripSettings";
import styles from "@/components/platform/GolfTripHome.module.css";
export default async function DeleteSavedTrip({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const view = await getGolfTrip(tripId);
  if (view.status === "signed-out") redirect("/login");
  if (view.status !== "ok" || !view.viewer.isOrganizer) notFound();
  return <main className={styles.page}><Link href={`/golf-trips/${tripId}/settings`}>Back to settings</Link><h1>Delete {view.trip.trip.name}</h1><DeleteTrip tripId={tripId} /></main>;
}
