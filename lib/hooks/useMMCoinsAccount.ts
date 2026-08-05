"use client";

import { useCallback, useEffect, useState } from "react";
import { useAccountSession } from "@/lib/useAccountSession";
import type { Wager } from "@/lib/wagers/types";

export interface MMCoinsAccount {
  balance: number;
  wagers: Wager[];
}

const CHANGE_EVENT = "mm:coins-changed";

/** Call after a successful mutation (e.g. placing a bet) so every mounted useMMCoinsAccount() re-fetches. */
export function notifyMMCoinsChanged() {
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
}

/**
 * Fetches the signed-in account's MM Coins balance + wager history from
 * the server. Replaces the old localStorage-backed lib/wagers/wallet.ts —
 * this is async and network-backed, not synchronous.
 */
export function useMMCoinsAccount() {
  const session = useAccountSession();
  const [account, setAccount] = useState<MMCoinsAccount | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!session) {
      setAccount(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/wagers/mm-coins/account", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load account");
      const data = await res.json();
      setAccount({ balance: data.balance, wagers: data.wagers });
    } catch {
      setAccount(null);
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
    window.addEventListener(CHANGE_EVENT, refresh);
    return () => window.removeEventListener(CHANGE_EVENT, refresh);
  }, [refresh]);

  return { session, account, loading, refresh };
}

/** Places a single MM Coins bet server-side. Notifies every useMMCoinsAccount() to re-fetch on success. */
export async function placeMMCoinBet(input: {
  marketKey: string;
  selectionKey: string;
  label: string;
  odds: number;
  stake: number;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await fetch("/api/wagers/mm-coins/bet", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await res.json();
  if (!data.ok) return { ok: false, error: data.error ?? "Couldn't place that wager." };
  notifyMMCoinsChanged();
  return { ok: true };
}
