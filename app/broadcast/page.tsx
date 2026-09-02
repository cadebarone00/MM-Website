import type { Metadata } from "next";
import { getBroadcastPayload } from "@/lib/broadcast/state";
import { BroadcastStage } from "@/components/broadcast/BroadcastStage";

export const metadata: Metadata = {
  title: "Watch Live — The Maroon Masters",
};

export const dynamic = "force-dynamic";

export default async function BroadcastPage() {
  const initial = await getBroadcastPayload();
  return <BroadcastStage initial={initial} />;
}
