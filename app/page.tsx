import { redirect } from "next/navigation";
import { PlatformHome } from "@/components/platform/PlatformHome";
import { createSupabaseServerClient } from "@/lib/supabase/server";
export const metadata = { title: "The Maroon", description: "The digital home for competitive golf trips." };

export default async function Home() {
  const { data: { user } } = await (await createSupabaseServerClient()).auth.getUser();
  if (!user) redirect("/new-user");
  return <PlatformHome />;
}
