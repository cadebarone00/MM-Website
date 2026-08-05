"use client";

import { useEffect, useState } from "react";
import { useAccountSession } from "@/lib/useAccountSession";
import { accountKey, getBalance, onWagersChanged } from "@/lib/wagers/wallet";

/** The signed-in account's fake balance. Renders nothing if there's no session. */
export function BalancePill() {
  const session = useAccountSession();
  const key = accountKey(session);
  const [balance, setBalance] = useState<number | null>(null);

  useEffect(() => {
    if (!key) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setBalance(null);
      return;
    }
    setBalance(getBalance(key));
    return onWagersChanged(() => setBalance(getBalance(key)));
  }, [key]);

  if (key == null || balance == null) return null;

  return (
    <div className="inline-flex items-center gap-2 rounded-pill border border-gold-400 bg-cream-50 px-4 py-2">
      <span className="font-condensed text-2xs font-bold uppercase tracking-eyebrow text-ink-500">Balance</span>
      <span className="font-sans text-lg font-black text-maroon-700 tabular-nums">{balance.toLocaleString()} pts</span>
    </div>
  );
}
