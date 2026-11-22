import { notFound } from "next/navigation";
import { InvitePreview } from "@/components/dev/InvitePreview";

const screens = ["trip-accept", "tourney-accept", "league-accept", "play-accept"];

export default async function InvitePreviewPage({ params }: { params: Promise<{ screen: string }> }) {
  const { screen } = await params;
  if (process.env.NODE_ENV !== "development" || !screens.includes(screen)) notFound();
  return <InvitePreview screen={screen} />;
}
