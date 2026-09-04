import { WatchLiveExperience } from "@/components/watch-live/WatchLiveExperience";
import { getBroadcastPayload } from "@/lib/broadcast/state";

export const dynamic = "force-dynamic";

export default async function WatchLivePage() {
  const { seasonYear, state } = await getBroadcastPayload();
  return <WatchLiveExperience seasonYear={seasonYear} initialState={state} />;
}
