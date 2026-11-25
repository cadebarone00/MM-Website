import "server-only";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { freshBook, importTo, parseBook, tradeOn, type Book, type Trade, type Wallet, type WalletStore } from "./predictBook";

/**
 * Predict wallets on the account (supabase/golf_trip_predict_books.sql, project_specs.md "Predict follows the account").
 * One per player per trip. Profile ids always come from the signed-in session, never from the request body.
 * "not_installed" = the SQL file hasn't been run in this database yet.
 */

const table = () => createSupabaseServiceRoleClient().from("golf_trip_predict_books");
const missing = (code?: string) => code === "42P01" || code === "PGRST205" || code === "PGRST204";

function store(tripId: string, profileId: string): WalletStore {
  return {
    async load() {
      const { data, error } = await table().select("balance, positions, version").eq("golf_trip_id", tripId).eq("profile_id", profileId).maybeSingle();
      if (error) { if (missing(error.code)) return "not_installed"; console.error("predict wallet load failed:", error.message); return "failed"; }
      if (!data) return { book: freshBook(), version: 0 };
      return { book: parseBook(data) ?? freshBook(), version: Number(data.version) || 1 };
    },
    async write(version, book) {
      const row = { balance: book.balance, positions: book.positions, version: version + 1, updated_at: new Date().toISOString() };
      const { data, error } = version === 0
        ? await table().insert({ golf_trip_id: tripId, profile_id: profileId, ...row }).select("version")
        : await table().update(row).eq("golf_trip_id", tripId).eq("profile_id", profileId).eq("version", version).select("version");
      if (error) {
        if (error.code === "23505") return "conflict"; // another device saved the first wallet a moment ago
        if (missing(error.code)) return "not_installed";
        console.error("predict wallet save failed:", error.message);
        return "failed";
      }
      return data && data.length ? "ok" : "conflict";
    },
  };
}

export const loadWallet = (tripId: string, profileId: string): ReturnType<WalletStore["load"]> => store(tripId, profileId).load();
export const tradeWallet = (tripId: string, profileId: string, version: number, trade: Trade) => tradeOn(store(tripId, profileId), version, trade);
export const importWallet = (tripId: string, profileId: string, book: Book) => importTo(store(tripId, profileId), book);
export type { Wallet };
