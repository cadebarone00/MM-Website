"use client";

import { useMMCoinsAccount } from "@/lib/hooks/useMMCoinsAccount";
import { formatAmericanOdds } from "@/lib/wagers/americanOdds";
import { Badge } from "@/components/ui/Badge";

/** Every wager the signed-in account has placed, with its real settlement status. */
export function MyWagersList() {
  const { session, account, loading } = useMMCoinsAccount();

  if (!session) return null;
  if (loading) return <p className="font-sans text-sm text-ink-400">Loading…</p>;

  const wagers = account?.wagers ?? [];
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
          {wager.status === "pending" && <Badge variant="gold">Pending</Badge>}
          {wager.status === "won" && <Badge variant="fairway">Won</Badge>}
          {wager.status === "lost" && (
            <span className="font-condensed text-2xs font-bold uppercase tracking-wide text-score-under">Lost</span>
          )}
        </div>
      ))}
    </div>
  );
}
