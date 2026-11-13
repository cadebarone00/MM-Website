import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/profile/currentProfile";
import { ImportWalkthrough } from "@/components/platform/ImportWalkthrough";

export const metadata: Metadata = { title: "Import Past Trip | The Maroon" };

/** Golf Trips → Import past trip → Enter it in the app: the step-by-step walkthrough. Signed-in only. */
export default async function ImportPastTripPage() {
  const current = await getCurrentProfile();
  if (current.status === "signed-out") redirect("/login");
  return <ImportWalkthrough />;
}
