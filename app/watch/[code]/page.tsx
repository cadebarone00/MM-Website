import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { WatchPage } from "@/components/platform/WatchPage";

export const metadata: Metadata = { title: "Watch | The Maroon", robots: { index: false } };
export const dynamic = "force-dynamic";

/** Watch a tournament or golf trip with its watch code (/watch/W4K9PZ). No sign-in; read only. */
export default async function WatchCodePage({ params }: { params: Promise<{ code: string }> }) {
  const code = (await params).code.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!/^W[A-Z0-9]{5}$/.test(code)) notFound();
  return <WatchPage code={code} />;
}
