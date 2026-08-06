"use client";

import { useState } from "react";
import { useMMCoinsAccount, placeMMCoinBet } from "@/lib/hooks/useMMCoinsAccount";
import { formatAmericanOdds, potentialPayout } from "@/lib/wagers/americanOdds";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { SignInGate } from "./SignInGate";

/**
 * Single-selection bet slip. No parlays/combos in this phase — one
 * market, one stake, one confirmation.
 */
export function BetSlipSheet({
  marketKey,
  selectionKey,
  label,
  odds,
  open,
  onClose,
}: {
  marketKey: string;
  selectionKey: string;
  label: string;
  odds: number;
  open: boolean;
  onClose: () => void;
}) {
  const { session, account, loading } = useMMCoinsAccount();
  const [stake, setStake] = useState("10");
  const [error, setError] = useState<string | null>(null);
  const [placed, setPlaced] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;

  const stakeNumber = Number(stake);
  const balance = account?.balance ?? 0;

  async function confirm() {
    if (!session) return;
    if (!Number.isFinite(stakeNumber) || stakeNumber <= 0) {
      setError("Enter a stake greater than zero.");
      return;
    }
    if (stakeNumber > balance) {
      setError("That's more than your current balance.");
      return;
    }
    setSubmitting(true);
    const result = await placeMMCoinBet({ marketKey, selectionKey, stake: stakeNumber });
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(null);
    setPlaced(true);
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center lg:items-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-[420px] rounded-t-lg bg-white p-5 shadow-xl lg:rounded-lg">
        <div className="mb-3 flex items-center justify-between">
          <span className="font-condensed text-xs font-bold uppercase tracking-eyebrow text-ink-500">Wager Slip</span>
          <button type="button" onClick={onClose} className="font-sans text-sm text-ink-400">
            Close
          </button>
        </div>

        {!session ? (
          <SignInGate />
        ) : placed ? (
          <div className="py-4 text-center">
            <p className="font-sans text-sm font-semibold text-fairway-700">Wager placed — Pending</p>
            <Button className="mt-4" fullWidth onClick={onClose}>
              Done
            </Button>
          </div>
        ) : (
          <>
            <p className="font-sans text-base font-semibold text-ink-900">{label}</p>
            <p className="mt-1 font-condensed text-sm font-bold text-ink-500">{formatAmericanOdds(odds)}</p>
            <Input
              label="Stake"
              type="number"
              min={1}
              value={stake}
              onChange={(e) => setStake(e.target.value)}
              disabled={loading || submitting}
              wrapClassName="mt-4"
            />
            <p className="mt-2 font-sans text-2xs text-ink-400">
              Balance: {loading ? "…" : balance.toLocaleString()} pts &middot; Potential payout:{" "}
              {Number.isFinite(stakeNumber) && stakeNumber > 0 ? potentialPayout(stakeNumber, odds).toLocaleString() : "—"} pts
            </p>
            {error && <p className="mt-2 font-sans text-2xs text-score-under">{error}</p>}
            <Button className="mt-4" fullWidth onClick={confirm} disabled={loading || submitting}>
              {submitting ? "Placing…" : "Confirm Wager"}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
