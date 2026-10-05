import { notFound } from "next/navigation";
import { GolfTripSettingsPreview } from "@/components/platform/GolfTripSettingsPreview";
export const dynamic = "force-dynamic";
export default function MaroonUSettingsPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <GolfTripSettingsPreview tripName="Maroon U Active" backHref="/dev/tournament/maroon-u" />;
}
