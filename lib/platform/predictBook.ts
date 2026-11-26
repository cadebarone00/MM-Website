/**
 * Golf Trip → Predict wallet maths, shared by the website (components/platform/GolfTripPredict.tsx), the app and the server
 * route /api/golf-trips/<trip>/predict-book (project_specs.md "Predict follows the account"). Maroon Coins are play only:
 * no money, no prizes, no cash-out.
 *
 * Buying locks in today's price (the model's chance, kept between 1% and 99%): shares = coins ÷ price, and each share pays
 * 1 coin if it comes true. Selling cashes out at the current chance.
 */

export const STARTING_COINS = 1000;
/** Largest wallet we accept (a moved-over device wallet could have grown past 1,000 through good picks). */
const MAX_COINS = 1_000_000;
const MAX_POSITIONS = 500;

export type Position = { key: string; outcome: number; shares: number; paid: number };
export type Book = { balance: number; positions: Position[] };
export type Trade =
  | { kind: "buy"; key: string; outcome: number; chance: number; spend: number }
  | { kind: "sell"; index: number; key: string; chance: number };

export const freshBook = (): Book => ({ balance: STARTING_COINS, positions: [] });

/** The price you buy at: the chance, kept between 1% and 99% so nothing is free or impossible to buy. */
export const buyPrice = (chance: number) => Math.min(0.99, Math.max(0.01, chance));

const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);
const chanceOk = (n: unknown): n is number => finite(n) && n >= 0 && n <= 1;

/** A stored or sent wallet if it is well formed (coins never negative, sensible sizes), else null. */
export function parseBook(value: unknown): Book | null {
  if (!value || typeof value !== "object") return null;
  const { balance, positions } = value as { balance?: unknown; positions?: unknown };
  if (!finite(balance) || balance < 0 || balance > MAX_COINS || !Array.isArray(positions) || positions.length > MAX_POSITIONS) return null;
  const clean: Position[] = [];
  for (const p of positions) {
    const { key, outcome, shares, paid } = (p ?? {}) as Partial<Position>;
    if (typeof key !== "string" || !key || key.length > 200 || !Number.isInteger(outcome) || (outcome as number) < 0 || (outcome as number) > 50
      || !finite(shares) || shares <= 0 || shares > MAX_COINS * 100 || !finite(paid) || paid <= 0 || paid > MAX_COINS) return null;
    clean.push({ key, outcome: outcome as number, shares, paid });
  }
  return { balance, positions: clean };
}

/** A trade sent to the server, if well formed. */
export function parseTrade(value: unknown): Trade | null {
  const t = (value ?? {}) as Record<string, unknown>;
  if (typeof t.key !== "string" || !t.key || t.key.length > 200 || !chanceOk(t.chance)) return null;
  if (t.kind === "buy" && Number.isInteger(t.outcome) && (t.outcome as number) >= 0 && (t.outcome as number) <= 50 && finite(t.spend) && t.spend > 0)
    return { kind: "buy", key: t.key, outcome: t.outcome as number, chance: t.chance, spend: t.spend };
  if (t.kind === "sell" && Number.isInteger(t.index) && (t.index as number) >= 0) return { kind: "sell", index: t.index as number, key: t.key, chance: t.chance };
  return null;
}

/**
 * Applies one buy or sell. Returns the new wallet, or an error: you can't spend more coins than you have (a buy spends
 * at most your balance), and you can only sell a position you own.
 */
export function applyTrade(book: Book, trade: Trade): { ok: true; book: Book } | { ok: false; error: string } {
  if (trade.kind === "buy") {
    const paid = Math.min(trade.spend, book.balance);
    if (paid <= 0) return { ok: false, error: "Not enough coins." };
    if (book.positions.length >= MAX_POSITIONS) return { ok: false, error: "Too many open picks. Sell one first." };
    const shares = paid / buyPrice(trade.chance);
    return { ok: true, book: { balance: book.balance - paid, positions: [...book.positions, { key: trade.key, outcome: trade.outcome, shares, paid }] } };
  }
  const position = book.positions[trade.index];
  if (!position || position.key !== trade.key) return { ok: false, error: "That pick isn't in your wallet any more." };
  return { ok: true, book: { balance: book.balance + position.shares * trade.chance, positions: book.positions.filter((_, i) => i !== trade.index) } };
}

/** True when a wallet is just the untouched starting one (nothing worth moving over from a device). */
export const untouched = (book: Book) => book.positions.length === 0 && Math.abs(book.balance - STARTING_COINS) < 1e-9;

/** A wallet as stored: version 0 = nothing saved yet (a fresh 1,000-coin wallet). */
export type Wallet = { book: Book; version: number };
export type SaveResult =
  | { ok: true; wallet: Wallet }
  | { ok: false; code: "not_installed" | "failed" }
  | { ok: false; code: "conflict"; wallet: Wallet }
  | { ok: false; code: "refused"; message: string };
/** Where wallets live (the database on the server, memory in tests). `write` only saves if the stored version is still `version`. */
export interface WalletStore {
  load(): Promise<Wallet | "not_installed" | "failed">;
  write(version: number, book: Book): Promise<"ok" | "conflict" | "not_installed" | "failed">;
}

async function saveTo(store: WalletStore, version: number, book: Book): Promise<SaveResult> {
  const result = await store.write(version, book);
  if (result === "ok") return { ok: true, wallet: { book, version: version + 1 } };
  if (result !== "conflict") return { ok: false, code: result };
  const now = await store.load();
  return typeof now === "string" ? { ok: false, code: now } : { ok: false, code: "conflict", wallet: now };
}

/** One buy or sell from the wallet at `version`: refused if another device saved since, or if the maths doesn't allow it. */
export async function tradeOn(store: WalletStore, version: number, trade: Trade): Promise<SaveResult> {
  const current = await store.load();
  if (typeof current === "string") return { ok: false, code: current };
  if (current.version !== version) return { ok: false, code: "conflict", wallet: current };
  const next = applyTrade(current.book, trade);
  return next.ok ? saveTo(store, version, next.book) : { ok: false, code: "refused", message: next.error };
}

/** The one-time move of a device's wallet onto the account: only when nothing is saved there yet. */
export const importTo = (store: WalletStore, book: Book) => saveTo(store, 0, book);
