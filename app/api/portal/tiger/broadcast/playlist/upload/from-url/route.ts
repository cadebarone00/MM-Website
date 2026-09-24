// app/api/portal/tiger/broadcast/playlist/upload/from-url/route.ts
import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { requireHost } from "@/lib/portal/requireHost";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { getBroadcastDisplayYear } from "@/lib/broadcast/displayYear";
import { createR2Client, R2_BUCKET, r2PublicUrl } from "@/lib/r2/client";

const MAX_BYTES = 50 * 1024 * 1024; // 50MB — plenty for a song, small enough to not tie up this route for long.

const EXTENSION_BY_CONTENT_TYPE: Record<string, string> = {
  "audio/mpeg": ".mp3",
  "audio/mp3": ".mp3",
  "audio/mp4": ".m4a",
  "audio/x-m4a": ".m4a",
  "audio/wav": ".wav",
  "audio/x-wav": ".wav",
  "audio/ogg": ".ogg",
};
const ALLOWED_EXTENSIONS = [".mp3", ".m4a", ".wav", ".ogg"];

/**
 * Alternative to .../upload/sign + .../upload/confirm for a host who has a
 * direct link to an audio file rather than a local one to pick — the
 * browser still measures the track's length itself (pointing a throwaway
 * <audio> at the URL, same technique ScorecardEditor-style upload flows
 * use for local files), but the actual bytes are fetched and stored by
 * this server, not the browser, since the browser has no way to copy a
 * remote URL's bytes into R2 directly.
 *
 * Basic SSRF guard: host-only route (trusted actors, not the public), but
 * still worth rejecting the obvious cases — non-http(s) schemes and
 * literal-IP loopback/private/link-local addresses. This is a pragmatic
 * check on the hostname string, not full DNS-rebinding-proof hardening;
 * proportionate to who can reach this route at all.
 */
function isBlockedHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost")) return true;
  if (host === "0.0.0.0" || host === "::1") return true;
  return /^(127\.|10\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host);
}

export async function POST(request: Request) {
  const host = await requireHost();
  if (!host) {
    return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });
  }

  const { url, title, durationSeconds } = await request.json();
  if (
    typeof title !== "string" ||
    !title.trim() ||
    typeof durationSeconds !== "number" ||
    !Number.isFinite(durationSeconds) ||
    durationSeconds <= 0 ||
    typeof url !== "string"
  ) {
    return NextResponse.json({ ok: false, error: "Missing or invalid fields." }, { status: 400 });
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return NextResponse.json({ ok: false, error: "That's not a valid URL." }, { status: 400 });
  }
  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    return NextResponse.json({ ok: false, error: "Only http(s) links are supported." }, { status: 400 });
  }
  if (isBlockedHost(parsedUrl.hostname)) {
    return NextResponse.json({ ok: false, error: "That link isn't allowed." }, { status: 400 });
  }

  let response: Response;
  try {
    response = await fetch(parsedUrl, { signal: AbortSignal.timeout(15_000) });
  } catch (err) {
    console.error("playlist/upload/from-url: fetch failed", { url, err });
    return NextResponse.json({ ok: false, error: "Could not download that link." }, { status: 502 });
  }
  if (!response.ok || !response.body) {
    return NextResponse.json({ ok: false, error: `That link returned an error (status ${response.status}).` }, { status: 502 });
  }

  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_BYTES) {
    return NextResponse.json({ ok: false, error: "That file is too large (50MB max)." }, { status: 400 });
  }

  const contentType = (response.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  const urlExtension = ALLOWED_EXTENSIONS.find((ext) => parsedUrl.pathname.toLowerCase().endsWith(ext));
  const extension = EXTENSION_BY_CONTENT_TYPE[contentType] ?? urlExtension;
  if (!extension || (!contentType.startsWith("audio/") && !urlExtension)) {
    return NextResponse.json({ ok: false, error: "That link doesn't look like an audio file." }, { status: 400 });
  }

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  const reader = response.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_BYTES) {
        reader.cancel();
        return NextResponse.json({ ok: false, error: "That file is too large (50MB max)." }, { status: 400 });
      }
      chunks.push(value);
    }
  } catch (err) {
    console.error("playlist/upload/from-url: download stream failed", { url, err });
    return NextResponse.json({ ok: false, error: "Could not download that link." }, { status: 502 });
  }
  const fileBytes = Buffer.concat(chunks);

  const seasonYear = await getBroadcastDisplayYear();
  const storagePath = `playlist/${seasonYear}/${randomUUID()}${extension}`;

  try {
    const r2 = createR2Client();
    await r2.send(new PutObjectCommand({ Bucket: R2_BUCKET, Key: storagePath, Body: fileBytes, ContentType: contentType || undefined }));
  } catch (err) {
    console.error("playlist/upload/from-url: R2 upload failed", { storagePath, err });
    return NextResponse.json({ ok: false, error: "Downloaded the file, but could not save it." }, { status: 500 });
  }

  const service = createSupabaseServiceRoleClient();
  const { data, error } = await service
    .from("broadcast_playlist_tracks")
    .insert({ season_year: seasonYear, title: title.trim(), storage_path: storagePath, duration_seconds: durationSeconds })
    .select("id, title, storage_path, duration_seconds, uploaded_at")
    .single();

  if (error || !data) {
    console.error("playlist/upload/from-url: failed to insert track", error);
    return NextResponse.json({ ok: false, error: "Downloaded the file, but could not save it to the playlist." }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    track: { id: data.id, title: data.title, url: r2PublicUrl(data.storage_path), durationSeconds: Number(data.duration_seconds), uploadedAt: data.uploaded_at },
  });
}
