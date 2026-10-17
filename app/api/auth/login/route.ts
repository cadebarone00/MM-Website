import { NextResponse } from "next/server";
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { initializeAfterSignIn } from "@/lib/profile/profileInitialization";

// `ilike` treats `%`, `_`, and `\` as wildcards/escape chars. Escaping them
// here means user input is matched as a literal string (case-insensitively)
// rather than as a SQL LIKE pattern.
function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

export async function POST(request: Request) {
  const { usernameOrEmail, password } = await request.json();

  if (!usernameOrEmail || !password) {
    return NextResponse.json({ ok: false, error: "Enter your username/email and password." }, { status: 400 });
  }

  let email = usernameOrEmail;
  if (!usernameOrEmail.includes("@")) {
    const service = createSupabaseServiceRoleClient();
    const { data } = await service
      .from("profiles")
      .select("email")
      .ilike("username", escapeLikePattern(usernameOrEmail))
      .single();
    // No matching username: still run signInWithPassword against a dummy,
    // non-existent address so this path takes about as long as a real
    // wrong-password check. Otherwise an attacker can tell "username
    // exists" from "doesn't exist" purely from response latency, even
    // though the returned message is identical either way.
    email = data ? data.email : "nonexistent-user-lookup@example.invalid";
  }

  const supabase = await createSupabaseServerClient();
  const { data: signedIn, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    if (error.message.toLowerCase().includes("email not confirmed")) {
      // Only echo the email back when the person typed it (never reveal the email behind a username).
      return NextResponse.json(
        { ok: false, error: "Check your email to verify your account first.", unverified: true, email: usernameOrEmail.includes("@") ? email : null },
        { status: 400 },
      );
    }
    return NextResponse.json({ ok: false, error: "Incorrect username/email or password." }, { status: 400 });
  }

  // Accounts V2: a verified sign-in makes sure the profile exists (idempotent; never blocks the sign-in).
  await initializeAfterSignIn(signedIn.user?.id);
  return NextResponse.json({ ok: true });
}
