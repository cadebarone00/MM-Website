import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getBroadcastPayload } from "@/lib/broadcast/state";
import { BroadcastControlsPanel } from "@/components/portal/tiger/BroadcastControlsPanel";

export default async function BroadcastControlsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("is_host").eq("id", user.id).single();
  if (!profile?.is_host) redirect("/");

  const { state, config } = await getBroadcastPayload();

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="font-serif text-2xl font-bold text-ink-900">Broadcast Controls</h1>
      <p className="mt-1 font-sans text-sm text-ink-500">Force a scene on /broadcast, or hand control back to automatic rotation.</p>

      <iframe
        src="/broadcast"
        title="Broadcast preview"
        className="mt-4 aspect-video w-full rounded-lg border-2 border-stone-300"
      />

      <BroadcastControlsPanel initialState={state} config={config} />
    </div>
  );
}
