"use client";

import { useState } from "react";
import { useMMCoinsAccount, placeMMCoinBet } from "@/lib/hooks/useMMCoinsAccount";
import { formatAmericanOdds, potentialPayout } from "@/lib/wagers/americanOdds";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { SignInGate } from "./SignInGate";

/**
 * The stake-entry step for one chosen selection, embedded directly on a
 * Wagers market page (not a bottom sheet — that's BetSlipSheet, which stays
 * untouched for the unrelated Match Breakdown page). Places the bet
 * server-side against the signed-in account's real MM Coins balance.
 */
export function WagerStakeForm({
  marketKey,
  selectionKey,
  label,
  odds,
  onChangeSelection,
}: {
  marketKey: string;
  selectionKey: string;
  label: string;
  odds: number;
  onChangeSelection?: () => void;
}) {
  const { session, account, loading: accountLoading } = useMMCoinsAccount();
  const [stake, setStake] = useState("10");
  const [error, setError] = useState<string | null>(null);
  const [placing, setPlacing] = useState(false);
  const [placed, setPlaced] = useState(false);

  const stakeNumber = Number(stake);
  const balance = account?.balance ?? 0;

  async function confirm() {
    if (!Number.isFinite(stakeNumber) || stakeNumber <= 0) {
      setError("Enter a stake greater than zero.");
      return;
    }
    if (stakeNumber > balance) {
      setError("That's more than your current balance.");
      return;
    }
    setPlacing(true);
    setError(null);
    const result = await placeMMCoinBet({ marketKey, selectionKey, stake: stakeNumber });
    setPlacing(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setPlaced(true);
  }

  if (!session) return <SignInGate />;
  if (accountLoading) return <p className="py-6 text-center font-sans text-sm text-ink-400">Loading…</p>;

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
      <Button className="mt-4" fullWidth onClick={confirm} disabled={placing}>
        {placing ? "Placing…" : "Confirm Wager"}
      </Button>
    </div>
  );
}
