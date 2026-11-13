"use client";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { GolfTripJoinLink } from "@/components/platform/GolfTripJoinLink";
import { tripJoinValue, type JoinPreview } from "@/lib/platform/golfTripJoinLinks";
import { joinPageState } from "@/lib/platform/joinPageState";
import { useAppData } from "@/components/app/useAppData";
import { AppStatus } from "@/components/app/AppStatus";

/** App → a trip's join link or 6-character code (/golf-trips/join/?code=…): the website's join screen, with its preview from the server. */
function AppJoinTrip() {
  const code = tripJoinValue(useSearchParams().get("code"));
  const valid = code !== null;
  const [state, reload] = useAppData<{ preview: JoinPreview | null }>(valid ? `/api/golf-trips/join/${encodeURIComponent(code)}` : null);
  if (valid && state.status !== "ok") return <AppStatus state={state} onRetry={reload} />;
  const preview = valid && state.status === "ok" ? state.data.preview : null;
  // Signed in (the app only shows this screen to someone signed in), so the sign-up / log-in links aren't used.
  return <GolfTripJoinLink code={valid ? code : null} preview={preview} state={joinPageState(preview, true)} signupHref="/start/sign-up/" loginHref="/start/log-in/" />;
}

export default function AppJoinTripPage() {
  return <Suspense><AppJoinTrip /></Suspense>;
}
