import { applyTrade, freshBook, parseBook, untouched, type Book, type Trade } from "./predictBook";

/**
 * Golf → Predict wallet for one trip, on the account (project_specs.md "Predict follows the account"): the loading and
 * trading steps shared by the website and the app (each wraps them in a small React hook and passes its own way of
 * calling /api/golf-trips/<trip>/predict-book and of keeping a wallet on the device). No React here, so the app can use it.
 *   account  the server's wallet: same coins and picks on every device; trades are checked and saved there.
 *   device   the predict table isn't installed yet (503), or there's no saved trip: works on this device as before.
 * The first time the account wallet is used, a device wallet with coins or picks in it is copied over once.
 */
export type WalletRequest = (method: "GET" | "PUT", body?: unknown) => Promise<{ status: number; body: unknown }>;
export interface DeviceWallet { read(): Book | null; write(book: Book): void; moved(): boolean; markMoved(): void }
export type WalletState = { book: Book; version: number; mode: "loading" | "account" | "device"; error: string | null };

export const loadingWallet = (): WalletState => ({ book: freshBook(), version: 0, mode: "loading", error: null });
const deviceState = (device: DeviceWallet, error: string | null = null): WalletState => ({ book: device.read() ?? freshBook(), version: 0, mode: "device", error });

type Body = { book?: unknown; version?: unknown; error?: unknown } | null;
const walletOf = (body: Body) => {
  const book = parseBook(body?.book);
  return book && Number.isInteger(body?.version) ? { book, version: body!.version as number } : null;
};
/** "No connection" for both callers: a thrown fetch (website) or status 0 (app's apiRaw). */
const offline = (status: number) => status === 0;

/** Opens the wallet: the account's (moving this device's over once), or this device's when the account table isn't installed. */
export async function openWallet(request: WalletRequest | null, device: DeviceWallet): Promise<WalletState> {
  if (!request) return deviceState(device);
  try {
    const got = await request("GET");
    if (got.status === 503) return deviceState(device);
    if (offline(got.status)) return { ...loadingWallet(), error: "You're offline. Your coins load when you're back online." };
    let wallet = got.status === 200 ? walletOf(got.body as Body) : null;
    if (!wallet) return { ...loadingWallet(), error: String((got.body as Body)?.error ?? "Couldn't load your coins. Try again.") };
    const local = device.read();
    if (wallet.version === 0 && local && !untouched(local) && !device.moved()) {
      const moved = await request("PUT", { version: 0, import: local });
      const saved = walletOf(moved.body as Body);
      if ((moved.status === 200 || moved.status === 409) && saved) { wallet = saved; device.markMoved(); }
    }
    return { ...wallet, mode: "account", error: null };
  } catch {
    return { ...loadingWallet(), error: "You're offline. Your coins load when you're back online." };
  }
}

/** One buy or sell. Never pretends: a pick that wasn't saved leaves the wallet as it was and says why. */
export async function walletTrade(state: WalletState, trade: Trade, request: WalletRequest | null, device: DeviceWallet): Promise<{ state: WalletState; ok: boolean }> {
  if (state.mode === "device") {
    const result = applyTrade(state.book, trade);
    if (!result.ok) return { ok: false, state: { ...state, error: result.error } };
    device.write(result.book);
    return { ok: true, state: { ...state, book: result.book, error: null } };
  }
  if (state.mode !== "account" || !request) return { ok: false, state };
  try {
    const answer = await request("PUT", { version: state.version, trade });
    const wallet = walletOf(answer.body as Body);
    if (answer.status === 200 && wallet) return { ok: true, state: { ...wallet, mode: "account", error: null } };
    if (answer.status === 409 && wallet) return { ok: false, state: { ...wallet, mode: "account", error: "Your coins changed on another device. Check your wallet and try again." } };
    if (answer.status === 503) return { ok: false, state: deviceState(device, "Predict on your account isn't switched on yet, so this pick wasn't saved. Try again.") };
    if (offline(answer.status)) return { ok: false, state: { ...state, error: "You're offline. Your pick wasn't saved. Try again when you're back online." } };
    return { ok: false, state: { ...state, error: String((answer.body as Body)?.error ?? "Couldn't save your pick. Try again.") } };
  } catch {
    return { ok: false, state: { ...state, error: "You're offline. Your pick wasn't saved. Try again when you're back online." } };
  }
}
