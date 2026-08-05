"use client";

import { useEffect, useState } from "react";
import { useAccountSession } from "@/lib/useAccountSession";
import { accountKey, getWagers, onWagersChanged } from "@/lib/wagers/wallet";
import { formatAmericanOdds } from "@/lib/wagers/americanOdds";
import { Badge } from "@/components/ui/Badge";
import type { Wager } from "@/lib/wagers/types";

/** Every wager the signed-in account has placed. Everything shows Pending — there's no settlement engine yet. */
export function MyWagersList() {
  const session = useAccountSession();
  const key = accountKey(session);
  const [wagers, setWagers] = useState<Wager[]>([]);

  useEffect(() => {
    if (!key) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setWagers([]);
      return;
    }
    setWagers(getWagers(key));
    return onWagersChanged(() => setWagers(getWagers(key)));
  }, [key]);

  if (!key) return null;

  if (wagers.length === 0) {
    return <p className="font-sans text-sm text-ink-400">No wagers placed yet.</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      {wagers.map((wager) => (
        <div key={wager.id} className="flex items-center justify-between gap-3 rounded-md border border-ink-100 bg-white px-4 py-3">
          <div>
            <p className="m-0 font-sans text-sm font-semibold text-ink-900">{wager.selectionLabel}</p>
            <p className="m-0 font-sans text-2xs text-ink-400">
              {formatAmericanOdds(wager.odds)} &middot; Staked {wager.stake.toLocaleString()} pts &middot; Pays{" "}
              {wager.potentialPayout.toLocaleString()} pts
            </p>
          </div>
          <Badge variant="gold">Pending</Badge>
        </div>
      ))}
    </div>
  );
}
