"use client";

import { useMMCoinsAccount } from "@/lib/hooks/useMMCoinsAccount";

/** The signed-in account's MM Coins balance. Renders nothing if there's no session, or while the first load is in flight. */
export function BalancePill() {
  const { session, account, loading } = useMMCoinsAccount();

  if (!session || loading || !account) return null;

  return (
    <div className="inline-flex items-center gap-2 rounded-pill border border-gold-400 bg-cream-50 px-4 py-2">
      <span className="font-condensed text-2xs font-bold uppercase tracking-eyebrow text-ink-500">Balance</span>
      <span className="font-sans text-lg font-black text-maroon-700 tabular-nums">{account.balance.toLocaleString()} pts</span>
    </div>
  );
}
