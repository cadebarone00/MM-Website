import { DevRoundPreview } from "@/components/dev/DevRoundPreview";

/** App → the sample Play round (dev server only); a TestFlight / App Store build never shows it. */
export default function DevRoundAppPage() {
  return process.env.NODE_ENV === "development" ? <DevRoundPreview /> : null;
}
