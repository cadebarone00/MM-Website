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
    // No matching username: still run signInWithPassword against a dummy,
    // non-existent address so this path takes about as long as a real
    // wrong-password check. Otherwise an attacker can tell "username
    // exists" from "doesn't exist" purely from response latency, even
    // though the returned message is identical either way.
    email = data ? data.email : "nonexistent-user-lookup@example.invalid";
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    if (error.message.toLowerCase().includes("email not confirmed")) {
      return NextResponse.json(
        { ok: false, error: "Check your email to verify your account first.", unverified: true, email },
        { status: 400 },
      );
    }
    return NextResponse.json({ ok: false, error: "Incorrect username/email or password." }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
