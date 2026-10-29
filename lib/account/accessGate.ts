import { NextResponse, type NextRequest } from "next/server";
import { createClient, type User } from "@supabase/supabase-js";
import { accessDecision, classifyPath, enforcementEnabled, type LifecycleWord } from "./accessPolicy";

/**
 * Pending accounts Phase 5 — the single enforcement checkpoint, called by middleware.ts for every page and API request.
 * Does NOTHING unless MAROON_ACCOUNT_ENFORCEMENT=on (off by default): with it off this returns before any work, so the
 * app behaves exactly as before. With it on:
 *   - classifies the path (lib/account/accessPolicy.ts); public / account / internal paths pass untouched;
 *   - identifies the caller from the app's Bearer token or the web session cookie (both verified by Supabase Auth, so a
 *     revoked or expired token is simply "signed out"); a cookie for one account plus a token for another is refused;
 *   - reads the account's lifecycle from the database (account_lifecycle_state, service role) and fails CLOSED when it
 *     can't (missing migration, database error) — never treats an unknown state as Active;
 *   - pages: non-Active accounts are sent to /account/status; APIs: a JSON 401/403/503 with a fixed code, no details.
 * Signed-out requests always pass through to the route's own handling.
 */

const LIFECYCLE_WORDS = new Set<LifecycleWord>(["pending", "active", "active_needs_birthday", "ineligible", "review", "closed"]);

async function bearerUser(request: NextRequest): Promise<{ present: boolean; user: User | null }> {
  const token = /^Bearer\s+(\S+)$/i.exec(request.headers.get("authorization") ?? "")?.[1];
  if (!token) return { present: false, user: null };
  const client = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.auth.getUser(token);
  return { present: true, user: error ? null : data.user };
}

async function lifecycleWord(accountId: string): Promise<LifecycleWord> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return "unavailable";
  const service = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await service.rpc("account_lifecycle_state", { p_account: accountId });
  if (error || typeof data !== "string" || !LIFECYCLE_WORDS.has(data as LifecycleWord)) return "unavailable";
  return data as LifecycleWord;
}

/** Null = carry on as normal. Otherwise the redirect / refusal to send instead. */
export async function enforceAccountAccess(request: NextRequest, cookieUser: User | null): Promise<NextResponse | null> {
  if (!enforcementEnabled()) return null;
  const { pathname } = request.nextUrl;
  const { category } = classifyPath(pathname, request.method);
  if (category === "public" || category === "account" || category === "internal") return null;

  const isApi = pathname.startsWith("/api/");
  const bearer = await bearerUser(request);
  if (bearer.user && cookieUser && bearer.user.id !== cookieUser.id) {
    return NextResponse.json({ ok: false, code: "session_conflict", error: "Sign out and sign in again.", next: null }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  // An app request carrying a token answers for that token only (a dead token is signed out, not the cookie's account).
  const user = bearer.present ? bearer.user : cookieUser;
  if (!user) return null;

  const decision = accessDecision(category, await lifecycleWord(user.id), isApi);
  if (decision.type === "allow") return null;
  if (decision.type === "redirect") return NextResponse.redirect(new URL(decision.location, request.url), 307);
  return NextResponse.json(decision.body, { status: decision.status, headers: { "Cache-Control": "no-store" } });
}
