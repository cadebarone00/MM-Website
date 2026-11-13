import { ImportWalkthrough } from "@/components/platform/ImportWalkthrough";

/** App simulator: the Import past trip walkthrough on the sample route (no sign-in, nothing saved). */
export default function SampleImportWalkthrough() {
  return <ImportWalkthrough endpoint="/api/dev/past-trip-import" backHref="/dev/import-trip" storageKey="maroon.pastTripDraft.sample" />;
}
