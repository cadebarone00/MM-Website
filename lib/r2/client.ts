// lib/r2/client.ts
import { S3Client } from "@aws-sdk/client-s3";

/**
 * Cloudflare R2 is S3-API-compatible, so the official AWS SDK talks to it
 * directly — just point it at R2's account-scoped endpoint instead of a
 * real AWS region. Used only for shot video (Supabase Storage still holds
 * everything else) — R2 charges nothing to serve a file back out, which
 * matters far more than storage cost once real viewers start watching
 * these clips.
 */
export function createR2Client(): S3Client {
  return new S3Client({
    region: "auto",
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  });
}

export const R2_BUCKET = process.env.R2_BUCKET_NAME ?? "shot-videos";

/** Public playback URL for an object key, via the bucket's public r2.dev URL (R2_PUBLIC_URL, no trailing slash). */
export function r2PublicUrl(key: string): string {
  return `${process.env.R2_PUBLIC_URL}/${key}`;
}
