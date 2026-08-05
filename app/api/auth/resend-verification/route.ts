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
    // Never surface Supabase's error text to the client — it can differ
    // based on whether the email is registered, which would turn this into
    // an account-enumeration oracle. Log it server-side and always report
    // success instead.
    console.error("resend-verification failed:", error.message);
  }
  return NextResponse.json({ ok: true });
}
