import { WatchLiveExperience } from "@/components/watch-live/WatchLiveExperience";
import { getBroadcastPayload } from "@/lib/broadcast/state";
import { getBroadcastPlaylist } from "@/lib/broadcast/playlist";

export const dynamic = "force-dynamic";

export default async function WatchLivePage() {
  const [{ seasonYear, state }, { tracks }] = await Promise.all([getBroadcastPayload(), getBroadcastPlaylist()]);
  return <WatchLiveExperience seasonYear={seasonYear} initialState={state} initialTracks={tracks} />;
}
