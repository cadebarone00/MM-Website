"use client";

import { useState } from "react";
import { useAccountSession } from "@/lib/useAccountSession";
import { accountKey, getBalance, placeWager } from "@/lib/wagers/wallet";
import { formatAmericanOdds, potentialPayout } from "@/lib/wagers/americanOdds";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { SignInGate } from "./SignInGate";

/**
 * The stake-entry step for one chosen selection, embedded directly on a
 * Wagers market page (not a bottom sheet — that's BetSlipSheet, which stays
 * untouched for the unrelated Match Breakdown page). Same placeWager logic
 * as BetSlipSheet, just presented inline instead of in a modal.
 */
export function WagerStakeForm({
  label,
  odds,
  onChangeSelection,
}: {
  label: string;
  odds: number;
  onChangeSelection?: () => void;
}) {
  const session = useAccountSession();
  const key = accountKey(session);
  const [stake, setStake] = useState("10");
  const [error, setError] = useState<string | null>(null);
  const [placed, setPlaced] = useState(false);

  const stakeNumber = Number(stake);
  const balance = key ? getBalance(key) : 0;

  function confirm() {
    if (!key) return;
    if (!Number.isFinite(stakeNumber) || stakeNumber <= 0) {
      setError("Enter a stake greater than zero.");
      return;
    }
    if (stakeNumber > balance) {
      setError("That's more than your current balance.");
      return;
    }
    const ok = placeWager(key, {
      id: `${Date.now()}-${Math.round(Math.random() * 1e6)}`, // eslint-disable-line react-hooks/purity
      placedAt: new Date().toISOString(),
      selectionLabel: label,
      odds,
      stake: stakeNumber,
      potentialPayout: potentialPayout(stakeNumber, odds),
      status: "pending",
    });
    if (!ok) {
      setError("Couldn't place that wager — check your balance.");
      return;
    }
    setError(null);
    setPlaced(true);
  }

  if (!key) return <SignInGate />;

  if (placed) {
    return (
      <div className="py-6 text-center">
        <p className="font-sans text-sm font-semibold text-fairway-700">Wager placed — Pending</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="m-0 font-sans text-base font-semibold text-ink-900">{label}</p>
          <p className="m-0 mt-1 font-condensed text-sm font-bold text-ink-500">{formatAmericanOdds(odds)}</p>
        </div>
        {onChangeSelection && (
          <button type="button" onClick={onChangeSelection} className="font-sans text-2xs font-semibold text-maroon-700">
            Change
          </button>
        )}
      </div>
      <Input label="Stake" type="number" min={1} value={stake} onChange={(e) => setStake(e.target.value)} wrapClassName="mt-4" />
      <p className="mt-2 font-sans text-2xs text-ink-400">
        Balance: {balance.toLocaleString()} pts &middot; Potential payout:{" "}
        {Number.isFinite(stakeNumber) && stakeNumber > 0 ? potentialPayout(stakeNumber, odds).toLocaleString() : "—"} pts
      </p>
      {error && <p className="mt-2 font-sans text-2xs text-score-under">{error}</p>}
      <Button className="mt-4" fullWidth onClick={confirm}>
        Confirm Wager
      </Button>
    </div>
  );
}
