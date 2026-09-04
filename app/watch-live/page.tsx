import { WatchLiveExperience } from "@/components/watch-live/WatchLiveExperience";
import { getBroadcastPayload } from "@/lib/broadcast/state";

export const dynamic = "force-dynamic";

export default async function WatchLivePage() {
  const { state } = await getBroadcastPayload();
  return <WatchLiveExperience tournamentLive={state.tournamentLive} />;
}
