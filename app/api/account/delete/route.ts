import { NextResponse } from "next/server";
import { accountForRequest } from "@/lib/profile/profileInitialization";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { deletionPreview, requestAccountDeletion, requestWithFreshSignIn } from "@/lib/account/accountDeletion";

/**
 * Settings → Account → Delete account (Accounts V2, Step 3; supabase/account_deletion.sql).
 * GET  = what deleting would do + whether a deletion is already under way.
 * POST = delete MY account: { confirm: "DELETE", password? }. The account always comes from the verified session (web
 *        cookie or `Authorization: Bearer`); any id in the body is ignored. Needs a sign-in within the last 10 minutes,
 *        or the account password typed into the form. Answers the state actually reached: "completed" only after the
 *        database, Storage and the login itself are all gone; anything earlier means closed, finishing in the background.
 */
const headers = { "Cache-Control": "no-store" };

export async function GET(request: Request) {
  const account = await accountForRequest(request);
  if (!account) return NextResponse.json({ ok: false, error: "Log in first." }, { status: 401, headers });
  const { data } = await createSupabaseServiceRoleClient().rpc("account_deletion_state", { p_account: account.id });
  const state = ((data ?? {}) as { state?: string | null }).state ?? null;
  const preview = state ? null : await deletionPreview(account.id);
  return NextResponse.json({ ok: true, state, preview }, { headers });
}

export async function POST(request: Request) {
  const account = await accountForRequest(request);
  if (!account) return NextResponse.json({ ok: false, error: "Log in first." }, { status: 401, headers });
  const body = await request.json().catch(() => null) as { confirm?: unknown; password?: unknown } | null;
  if (body?.confirm !== "DELETE") return NextResponse.json({ ok: false, error: "Type DELETE to confirm." }, { status: 400, headers });
  let signedIn: Request = request;
  if (typeof body.password === "string" && body.password) {
    const fresh = await requestWithFreshSignIn(account.email, body.password);
    if (!fresh) return NextResponse.json({ ok: false, reauth: true, error: "That password isn't right." }, { status: 401, headers });
    signedIn = fresh;
  }
  const result = await requestAccountDeletion(signedIn);
  if (result.status === "reauth-required") return NextResponse.json({ ok: false, reauth: true, error: "Enter your password to confirm it's you." }, { status: 401, headers });
  if (result.status === "signed-out") return NextResponse.json({ ok: false, error: "Log in first." }, { status: 401, headers });
  if (result.status === "failed") return NextResponse.json({ ok: false, error: "We couldn't start deleting your account. Try again." }, { status: 500, headers });
  return NextResponse.json({ ok: true, state: result.state, completed: result.state === "completed" }, { headers });
}
