import { DevLeaguePreview } from "@/components/dev/DevLeaguePreview";

/** App → the Leagues preview (dev server only, `npm run dev:app`); a TestFlight / App Store build never shows it. */
export default function DevLeaguesAppPage() {
  return process.env.NODE_ENV === "development" ? <DevLeaguePreview /> : null;
}
