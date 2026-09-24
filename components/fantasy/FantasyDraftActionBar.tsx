"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { getPlayerFirstName } from "@/lib/data/players";
import { safeSessionStorage, writeDraftPick, type FantasySlot } from "@/lib/fantasy/draftState";

/**
 * Shown on a player's live profile page only when reached from the Fantasy
 * draft flow (?draftSlot=...). The page's own back button already returns
 * to /fantasy (see app/leaderboard/[slug]/players/[player]/page.tsx) - this
 * bar is the one new piece of UI, for actually drafting the player.
 */
export function FantasyDraftActionBar({
  tournamentSlug,
  player,
  slot,
}: {
  tournamentSlug: string;
  player: string;
  slot: FantasySlot;
}) {
  const router = useRouter();

  function handleDraft() {
    writeDraftPick(safeSessionStorage, tournamentSlug, slot, player);
    router.push("/fantasy");
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-ink-100 bg-white px-4 py-3 shadow-[0_-2px_12px_rgba(0,0,0,0.06)]">
      <Button fullWidth onClick={handleDraft}>
        Draft {getPlayerFirstName(player)}
      </Button>
    </div>
  );
}
