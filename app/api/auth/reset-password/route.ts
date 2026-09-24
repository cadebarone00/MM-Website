import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PASSWORD_LINK_ERROR } from "@/lib/auth/passwordSession";

export async function POST(request: Request) {
  const { password } = await request.json();
  if (typeof password !== "string" || password.length < 6) {
    return NextResponse.json({ ok: false, error: "Password must be at least 6 characters." }, { status: 400 });
  }
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    return NextResponse.json({ ok: false, error: error.name === "AuthSessionMissingError" ? PASSWORD_LINK_ERROR : error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
