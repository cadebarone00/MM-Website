import type { AccountSession } from "@/lib/useAccountSession";
import type { Wager } from "./types";

export const STARTING_BALANCE = 1000;
const CHANGE_EVENT = "mm:wagers-changed";

/**
 * A stable per-account storage key. Returns null for a signed-out
 * visitor — callers use that to know there's nowhere to read/write a
 * balance, and to gate Wagers content on "is this null."
 */
export function accountKey(session: AccountSession): string | null {
  if (!session) return null;
  return session.kind === "host" ? `host:${session.username.toLowerCase()}` : `player:${session.playerFirst.toLowerCase()}`;
}

function balanceStorageKey(key: string): string {
  return `mm-wagers-balance:${key}`;
}

function historyStorageKey(key: string): string {
  return `mm-wagers-history:${key}`;
}

/** Reads the fake balance for `key`, seeding it to STARTING_BALANCE on first read. */
export function getBalance(key: string): number {
  const raw = localStorage.getItem(balanceStorageKey(key));
  if (raw == null) {
    localStorage.setItem(balanceStorageKey(key), String(STARTING_BALANCE));
    return STARTING_BALANCE;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : STARTING_BALANCE;
}

/** Every wager `key` has placed, newest first. */
export function getWagers(key: string): Wager[] {
  const raw = localStorage.getItem(historyStorageKey(key));
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Deducts `wager.stake` from the balance and records `wager`. Returns
 * false (nothing changed) if the stake is invalid or exceeds the
 * current balance.
 */
export function placeWager(key: string, wager: Wager): boolean {
  const balance = getBalance(key);
  if (wager.stake <= 0 || wager.stake > balance) return false;

  localStorage.setItem(balanceStorageKey(key), String(balance - wager.stake));
  localStorage.setItem(historyStorageKey(key), JSON.stringify([wager, ...getWagers(key)]));
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
  return true;
}

/** Subscribes to balance/history changes made by `placeWager`; returns an unsubscribe function. */
export function onWagersChanged(handler: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, handler);
  return () => window.removeEventListener(CHANGE_EVENT, handler);
}
