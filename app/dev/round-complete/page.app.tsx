import { DevRoundCompletePreview } from "@/components/dev/DevRoundCompletePreview";

/** App → the Round complete sample (dev server only); a TestFlight / App Store build never shows it. */
export default function DevRoundCompleteAppPage() {
  return process.env.NODE_ENV === "development" ? <DevRoundCompletePreview /> : null;
}
