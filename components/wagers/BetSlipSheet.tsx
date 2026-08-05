"use client";

import { useState } from "react";
import { useAccountSession } from "@/lib/useAccountSession";
import { accountKey, getBalance, placeWager } from "@/lib/wagers/wallet";
import { formatAmericanOdds, potentialPayout } from "@/lib/wagers/americanOdds";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { SignInGate } from "./SignInGate";

/**
 * Single-selection bet slip. No parlays/combos in this phase — one
 * market, one stake, one confirmation.
 */
export function BetSlipSheet({
  label,
  odds,
  open,
  onClose,
}: {
  label: string;
  odds: number;
  open: boolean;
  onClose: () => void;
}) {
  const session = useAccountSession();
  const key = accountKey(session);
  const [stake, setStake] = useState("10");
  const [error, setError] = useState<string | null>(null);
  const [placed, setPlaced] = useState(false);

  if (!open) return null;

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
      id: `${Date.now()}-${Math.round(Math.random() * 1e6)}`, // eslint-disable-line
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

        {!key ? (
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
              wrapClassName="mt-4"
            />
            <p className="mt-2 font-sans text-2xs text-ink-400">
              Balance: {balance.toLocaleString()} pts &middot; Potential payout:{" "}
              {Number.isFinite(stakeNumber) && stakeNumber > 0 ? potentialPayout(stakeNumber, odds).toLocaleString() : "—"} pts
            </p>
            {error && <p className="mt-2 font-sans text-2xs text-score-under">{error}</p>}
            <Button className="mt-4" fullWidth onClick={confirm}>
              Confirm Wager
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
