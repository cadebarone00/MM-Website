import { NextResponse } from "next/server";

type InstagramMedia = {
  id?: string;
  caption?: string;
  media_type?: string;
  media_product_type?: string;
  media_url?: string;
  thumbnail_url?: string;
  permalink?: string;
  timestamp?: string;
};

function mediaEndpoint() {
  const token = process.env.INSTAGRAM_ACCESS_TOKEN;
  const userId = process.env.INSTAGRAM_USER_ID;

  if (!token) return null;

  const fields = "id,caption,media_type,media_product_type,media_url,thumbnail_url,permalink,timestamp";
  const base = userId ? `https://graph.facebook.com/v20.0/${userId}/media` : "https://graph.instagram.com/me/media";
  const url = new URL(base);
  url.searchParams.set("fields", fields);
  url.searchParams.set("limit", "12");
  url.searchParams.set("access_token", token);
  return url;
}

export async function GET() {
  const url = mediaEndpoint();

  if (!url) {
    return NextResponse.json({ reels: [], configured: false }, { headers: { "Cache-Control": "no-store" } });
  }

  try {
    const res = await fetch(url, { next: { revalidate: 900 } });
    if (!res.ok) {
      return NextResponse.json({ reels: [], configured: true, error: `Instagram responded with ${res.status}` }, { status: 200 });
    }

    const data = (await res.json()) as { data?: InstagramMedia[] };
    const reels = (data.data ?? [])
      .filter((item) => item.media_type === "VIDEO" || item.media_product_type === "REELS")
      .slice(0, 4)
      .map((item) => ({
        id: item.id ?? item.permalink ?? "",
        caption: item.caption ?? "Maroon Masters Reel",
        thumbnailUrl: item.thumbnail_url ?? item.media_url ?? "",
        permalink: item.permalink ?? "https://www.instagram.com/themaroonmasters/",
        timestamp: item.timestamp ?? "",
      }));

    return NextResponse.json({ reels, configured: true }, { headers: { "Cache-Control": "s-maxage=900, stale-while-revalidate=3600" } });
  } catch {
    return NextResponse.json({ reels: [], configured: true, error: "Could not reach Instagram." }, { status: 200 });
  }
}
