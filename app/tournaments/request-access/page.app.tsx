"use client";
import { RequestAccessView } from "@/components/platform/TourneyAccessViews";
import type { MyAccessResult } from "@/lib/platform/accessRequestsServer";
import { useAppData } from "@/components/app/useAppData";
import { AppStatus } from "@/components/app/AppStatus";

/** App → Request tournament-creator access. */
export default function AppRequestAccess() {
  const [state, reload] = useAppData<MyAccessResult>("/api/app/tourneys");
  if (state.status !== "ok") return <AppStatus state={state} onRetry={reload} />;
  if (!state.data.signedIn) return <AppStatus state={{ status: "error", error: "Sign in to request access.", code: 401 }} onRetry={reload} />;
  return <RequestAccessView result={state.data} />;
}
