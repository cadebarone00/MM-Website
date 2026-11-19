/**
 * Profile socials (project_specs.md "Profile socials", 2026-11-13; supabase/profile_socials.sql): up to 4 social
 * profiles, one per app, shown 2 × 2 under the bio. People type a username (or paste their profile link) and the
 * address is built here, so a social always points at that app's own site. The database checks the same rules again
 * (profile_social_url_ok / profile_social_title) — keep the two in step.
 */

export const SOCIALS_MAX = 4;

interface PlatformRule { id: string; label: string; prefix: string; handle: RegExp; at: boolean; hosts: string[]; hint: string }
export const SOCIAL_PLATFORMS = [
  { id: "instagram", label: "Instagram", prefix: "https://instagram.com/", handle: /^[A-Za-z0-9._]{1,30}$/, at: true, hosts: ["instagram.com"], hint: "Username" },
  { id: "facebook", label: "Facebook", prefix: "https://facebook.com/", handle: /^[A-Za-z0-9.]{1,50}$/, at: false, hosts: ["facebook.com", "fb.com"], hint: "Username" },
  { id: "youtube", label: "YouTube", prefix: "https://youtube.com/@", handle: /^[A-Za-z0-9._-]{3,30}$/, at: true, hosts: ["youtube.com"], hint: "Handle" },
  { id: "tiktok", label: "TikTok", prefix: "https://tiktok.com/@", handle: /^[A-Za-z0-9._]{2,24}$/, at: true, hosts: ["tiktok.com"], hint: "Username" },
  { id: "linkedin", label: "LinkedIn", prefix: "https://linkedin.com/in/", handle: /^[A-Za-z0-9-]{3,100}$/, at: false, hosts: ["linkedin.com"], hint: "Profile name (linkedin.com/in/…)" },
  { id: "x", label: "X (Twitter)", prefix: "https://x.com/", handle: /^[A-Za-z0-9_]{1,15}$/, at: true, hosts: ["x.com", "twitter.com"], hint: "Username" },
  { id: "threads", label: "Threads", prefix: "https://threads.net/@", handle: /^[A-Za-z0-9._]{1,30}$/, at: true, hosts: ["threads.net", "threads.com"], hint: "Username" },
  { id: "snapchat", label: "Snapchat", prefix: "https://snapchat.com/add/", handle: /^[A-Za-z0-9._-]{3,15}$/, at: true, hosts: ["snapchat.com"], hint: "Username" },
  { id: "strava", label: "Strava", prefix: "https://strava.com/athletes/", handle: /^[0-9]{1,12}$/, at: false, hosts: ["strava.com"], hint: "Athlete number or profile link" },
  { id: "website", label: "Website", prefix: "https://", handle: /^[^\s/$.?#][^\s]*$/, at: false, hosts: [], hint: "Web address" },
] as const satisfies readonly PlatformRule[];

export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number]["id"];
export interface ProfileSocial { platform: SocialPlatform; title: string; url: string }

const rule = (platform: string) => SOCIAL_PLATFORMS.find((p) => p.id === platform);
export const isSocialPlatform = (v: unknown): v is SocialPlatform => typeof v === "string" && Boolean(rule(v));
export const socialLabel = (platform: SocialPlatform) => rule(platform)!.label;
export const socialHint = (platform: SocialPlatform) => rule(platform)!.hint;
const WEBSITE = /^https:\/\/[^\s/$.?#][^\s]*$/;

/** Same as the database's profile_social_url_ok: a real profile address for that app. */
export function socialUrlOk(platform: string, url: string): boolean {
  const r = rule(platform);
  if (!r || url.length > 300) return false;
  if (r.id === "website") return WEBSITE.test(url);
  return url.startsWith(r.prefix) && r.handle.test(url.slice(r.prefix.length));
}

/** Same as the database's profile_social_title: the username, or the website without https:// (≤ 100 characters). */
export function socialTitle(platform: SocialPlatform, url: string): string {
  if (platform === "website") return url.replace(/^https:\/\//, "").replace(/\/$/, "").slice(0, 100);
  return url.slice(rule(platform)!.prefix.length).slice(0, 100);
}

/** What the profile shows in the social's box: @name for apps that use @, the plain name otherwise. */
export function socialDisplay(social: ProfileSocial): string {
  const r = rule(social.platform)!;
  if (social.platform === "strava") return "Strava";
  return r.at ? `@${social.title}` : social.title;
}

/** The username out of a pasted profile link for that app (instagram.com/me, https://www.tiktok.com/@me?lang=en, …). */
function handleFromLink(platform: SocialPlatform, typed: string): string | null {
  const r = rule(platform)!;
  let url: URL;
  try { url = new URL(/^[a-z]+:\/\//i.test(typed) ? typed : `https://${typed}`); } catch { return null; }
  const host = url.hostname.toLowerCase().replace(/^(www|m|mobile)\./, "");
  if (!(r.hosts as readonly string[]).includes(host)) return null;
  const parts = url.pathname.split("/").filter(Boolean);
  const first = platform === "linkedin" ? parts[parts[0] === "in" ? 1 : 0]
    : platform === "snapchat" ? parts[parts[0] === "add" ? 1 : 0]
    : platform === "strava" ? parts[parts[0] === "athletes" ? 1 : 0]
    : parts[0];
  return first ? decodeURIComponent(first).replace(/^@/, "") : null;
}

/** What someone typed for an app → the social to save, or a plain message saying what's wrong. */
export function socialFromInput(platform: SocialPlatform, typed: string): { ok: true; social: ProfileSocial } | { ok: false; error: string } {
  const text = typed.trim();
  const r = rule(platform)!;
  if (!text) return { ok: false, error: platform === "website" ? "Type a web address." : `Type your ${r.label} username.` };
  if (platform === "website") {
    if (/^http:\/\//i.test(text)) return { ok: false, error: "Use the https:// address of your website." };
    const url = /^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`;
    return socialUrlOk("website", url) ? { ok: true, social: { platform, title: socialTitle(platform, url), url } } : { ok: false, error: "That doesn't look like a web address." };
  }
  const looksLikeLink = /[/]|\.(com|net)\b/i.test(text);
  const handle = looksLikeLink ? handleFromLink(platform, text) : text.replace(/^@/, "");
  if (looksLikeLink && handle === null) return { ok: false, error: `That link isn't from ${r.label}.` };
  const url = r.prefix + handle;
  return handle && socialUrlOk(platform, url) ? { ok: true, social: { platform, title: socialTitle(platform, url), url } }
    : { ok: false, error: `That doesn't look like a ${r.label} ${platform === "strava" ? "athlete number" : "username"}.` };
}

/** PUT /api/account/links body { links: [{ platform, url }] } → the checked list (max 4, one per app), or the first problem. */
export function profileSocialsFromBody(body: unknown): { ok: true; socials: ProfileSocial[] } | { ok: false; error: string } {
  const list = body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>).links : null;
  if (!Array.isArray(list)) return { ok: false, error: "Socials must be a list." };
  if (list.length > SOCIALS_MAX) return { ok: false, error: `You can add up to ${SOCIALS_MAX} socials.` };
  const socials: ProfileSocial[] = [];
  for (const item of list) {
    const r = item && typeof item === "object" ? item as Record<string, unknown> : null;
    if (!r || !isSocialPlatform(r.platform) || typeof r.url !== "string" || !socialUrlOk(r.platform, r.url)) return { ok: false, error: "That username doesn't look right for that app." };
    if (socials.some((s) => s.platform === r.platform)) return { ok: false, error: "Each app can be added once." };
    socials.push({ platform: r.platform, title: socialTitle(r.platform, r.url), url: r.url });
  }
  return { ok: true, socials };
}

/** Saved socials read back from the database (anything malformed is skipped, never shown). */
export function profileSocialsFromRows(rows: unknown): ProfileSocial[] {
  const seen = new Set<string>();
  return (Array.isArray(rows) ? rows : []).flatMap((row): ProfileSocial[] => {
    const r = row && typeof row === "object" ? row as Record<string, unknown> : null;
    if (!r || !isSocialPlatform(r.platform) || typeof r.url !== "string" || !socialUrlOk(r.platform, r.url) || seen.has(r.platform)) return [];
    seen.add(r.platform);
    return [{ platform: r.platform, title: socialTitle(r.platform, r.url), url: r.url }];
  }).slice(0, SOCIALS_MAX);
}
