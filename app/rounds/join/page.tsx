import type { Metadata } from "next";
import { RoundJoinPage } from "@/components/platform/RoundJoin";

export const metadata: Metadata = { title: "Join a round | The Maroon", robots: { index: false } };

/** /rounds/join?code=…: join a friend's round with its code. */
export default function JoinRoundPage() {
  return <RoundJoinPage />;
}
