import type { Metadata } from "next";
import { GolfTripReview } from "@/components/platform/GolfTripReview";

export const metadata: Metadata = { title: "Create a Golf Trip | The Maroon" };

/** Golf Trip questionnaire, last step (Review). Read from the draft: nothing is saved to the database yet. */
export default function GolfTripReviewPage() {
  return <GolfTripReview />;
}
