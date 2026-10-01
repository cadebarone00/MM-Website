import type { Metadata } from "next";
import { GolfTripReview } from "@/components/platform/GolfTripReview";

export const metadata: Metadata = { title: "Create a Golf Trip | The Maroon" };

/** Golf Trip questionnaire, last step (Review): the answers, then Create Golf Trip (POST /api/golf-trips). */
export default function GolfTripReviewPage() {
  return <GolfTripReview />;
}
