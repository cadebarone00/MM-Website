import { NextResponse } from "next/server";
import { createSupabaseServiceRoleClient, createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  const body = await request.json().catch(() => null);
  if (user && typeof body?.endpoint === 'string') {
    const { error } = await createSupabaseServiceRoleClient().from('trip_push_subscriptions').delete().eq('profile_id', user.id).eq('endpoint', body.endpoint);
    // Missing migration has no subscriptions to remove; other failures must be surfaced before sign-out.
    if (error && error.code !== '42P01' && error.code !== 'PGRST205') return NextResponse.json({ error: 'Could not disable device alerts.' }, { status: 503 });
  }
  await supabase.auth.signOut();
  return NextResponse.json({ ok: true });
}
