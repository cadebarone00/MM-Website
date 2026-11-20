import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SetupNextStep } from "@/components/platform/SetupNextStep";
import { GolfTripStart } from "@/components/platform/tour/GolfTripStart";
import { setupTypeFromParam } from "@/lib/platform/setupTypes";
import { getCurrentProfile, tripProfileId } from "@/lib/profile/currentProfile";

export const metadata: Metadata = { title: "Create a Tournament | The Maroon" };

export default async function SetupNextStepPage({ params }: { params: Promise<{ type: string }> }) {
  const { type: param } = await params;
  const type = setupTypeFromParam(param);
  if (!type) notFound();
  // Golf Trip (owner request 2026-11-20): no setup screen. Learn about Golf Trips the first time, then the first question.
  if (type.key === "golf-trip") return <GolfTripStart profileId={tripProfileId(await getCurrentProfile()) ?? "guest"} />;
  return <SetupNextStep type={type} />;
}
