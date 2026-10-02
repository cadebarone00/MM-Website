import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { GolfTripSettings } from "@/components/platform/GolfTripSettings";
import { golfTripUrl, isGolfTripId, type SavedGolfTrip } from "@/lib/platform/golfTripCreate";
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Trip Settings | The Maroon" };

/**
 * Trip Settings for a saved trip. Same access as the trip itself (members only). The signed-in member whose
 * role is organizer also gets the Organizer settings.
 */
export default async function SavedGolfTripSettingsPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  if (!isGolfTripId(tripId)) notFound();

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data, error } = await createSupabaseServiceRoleClient().rpc("get_golf_trip", { p_profile: user.id, p_trip: tripId });
  if (error) throw new Error(`get_golf_trip failed: ${error.message}`);
  if (!data) notFound();

  const isOrganizer = (data as SavedGolfTrip).members.some((member) => member.role === "organizer" && member.profileId === user.id);
  return <GolfTripSettings backHref={golfTripUrl(tripId)} isOrganizer={isOrganizer} />;
}
