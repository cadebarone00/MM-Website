import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function result(ok: boolean, account?: { username: string | null; email: string | null }) {
  return NextResponse.json({ ok, ...(account ? { account } : {}) }, { status: ok ? 200 : 401, headers: { "Cache-Control": "no-store" } });
}

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return result(false);
  const { data: profile } = await supabase.from("profiles").select("username").eq("id", data.user.id).single();
  return result(true, { username: profile?.username ?? null, email: data.user.email ?? null });
}

export async function POST(request: Request) {
  // Only accept JSON from this site's password form.
  if (request.headers.get("origin") !== new URL(request.url).origin ||
      !request.headers.get("content-type")?.includes("application/json")) {
    return result(false);
  }
  const body = await request.json().catch(() => null);
  if (typeof body?.access_token !== "string" || !body.access_token ||
      typeof body?.refresh_token !== "string" || !body.refresh_token) {
    return result(false);
  }
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.setSession({
    access_token: body.access_token,
    refresh_token: body.refresh_token,
  });
  if (error || !data.session) return result(false);
  return GET();
}
