import { NextResponse } from "next/server";
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const { usernameOrEmail, password } = await request.json();

  if (!usernameOrEmail || !password) {
    return NextResponse.json({ ok: false, error: "Enter your username/email and password." }, { status: 400 });
  }

  let email = usernameOrEmail;
  if (!usernameOrEmail.includes("@")) {
    const service = createSupabaseServiceRoleClient();
    const { data } = await service.from("profiles").select("email").ilike("username", usernameOrEmail).single();
    if (!data) {
      return NextResponse.json({ ok: false, error: "Incorrect username/email or password." }, { status: 400 });
    }
    email = data.email;
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    if (error.message.toLowerCase().includes("email not confirmed")) {
      return NextResponse.json({ ok: false, error: "Check your email to verify your account first.", unverified: true }, { status: 400 });
    }
    return NextResponse.json({ ok: false, error: "Incorrect username/email or password." }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
