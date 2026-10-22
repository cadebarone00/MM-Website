import { getPlayerDisplayName } from "@/lib/data/players";
import type { GolfMatchPreview } from "@/lib/platform/golfTripPreviewFixture";
import type { GolfTripDraft } from "@/lib/platform/golfTripDraft";

/**
 * DEV ONLY: the trip roster the Settings preview lists (players are positions on it, e.g. Skins → a round's players):
 * the tournament roster, else the golfers on the leaderboard, else whoever has joined, else the organizer.
 */
export function devSettingsRoster(data: { preview?: Partial<GolfTripDraft> | null; previewMatch?: GolfMatchPreview | null; travel?: { members: { name: string }[] } | null }): string[] {
  const preview = data.preview as Record<string, string | undefined> | undefined;
  const roster = [preview?.rosterMaroon, preview?.rosterWhite].flatMap(list => (list ?? "").split(",")).map(slug => slug.trim()).filter(Boolean).map(getPlayerDisplayName);
  const golfers = data.previewMatch?.leaderboard.map(row => row.golfer.name) ?? [];
  return roster.length ? roster : golfers.length ? golfers : data.travel?.members.map(member => member.name) ?? (preview?.yourName ? [preview.yourName] : []);
}
