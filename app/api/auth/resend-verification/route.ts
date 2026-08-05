import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const { email } = await request.json();
  if (!email) {
    return NextResponse.json({ ok: false, error: "Missing email." }, { status: 400 });
  }
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.resend({ type: "signup", email });
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
