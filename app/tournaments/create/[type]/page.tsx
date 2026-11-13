import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SetupNextStep } from "@/components/platform/SetupNextStep";
import { setupTypeFromParam } from "@/lib/platform/setupTypes";
import { getCurrentProfile, tripProfileId } from "@/lib/profile/currentProfile";

export const metadata: Metadata = { title: "Create a Tournament | The Maroon" };

export default async function SetupNextStepPage({ params }: { params: Promise<{ type: string }> }) {
  const { type: param } = await params;
  const type = setupTypeFromParam(param);
  if (!type) notFound();
  // Trip Builder (2026-11-03): Welcome to Golf Trips → Get Started (the Learn screen the first time).
  const profileId = type.key === "golf-trip" ? tripProfileId(await getCurrentProfile()) ?? "guest" : "guest";
  return <SetupNextStep type={type} profileId={profileId} />;
}
