import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { GolfTripHome } from "@/components/platform/GolfTripHome";
import { isGolfTripId, savedTripAsDraft, type SavedGolfTrip } from "@/lib/platform/golfTripCreate";
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Golf Trip | The Maroon" };

/**
 * Golf Trip Home for a saved trip. Only the trip's members can open it: get_golf_trip returns nothing for
 * anyone else, so a stranger sees the same "not found" as a trip that doesn't exist.
 */
export default async function SavedGolfTripPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  if (!isGolfTripId(tripId)) notFound();

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data, error } = await createSupabaseServiceRoleClient().rpc("get_golf_trip", { p_profile: user.id, p_trip: tripId });
  if (error) throw new Error(`get_golf_trip failed: ${error.message}`);
  if (!data) notFound();

  // GolfTripHome reads questionnaire-shaped answers; a saved trip is passed in the same shape.
  return <GolfTripHome preview={savedTripAsDraft(data as SavedGolfTrip)} />;
}
