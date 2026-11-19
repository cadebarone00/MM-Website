import { AtSign, Globe } from "lucide-react";
import type { SocialPlatform } from "@/lib/profile/profileSocials";

/**
 * Simple one-colour icons for the social apps (project_specs.md "Profile socials"): drawn here in our own style, in
 * currentColor, so nothing is loaded from the apps' sites. Threads and Website use lucide's @ and globe.
 */
export function SocialIcon({ platform, size = 18 }: { platform: SocialPlatform; size?: number }) {
  if (platform === "threads") return <AtSign size={size} aria-hidden="true" />;
  if (platform === "website") return <Globe size={size} aria-hidden="true" />;
  const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
    {platform === "instagram" && <g {...stroke}><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.3" cy="6.7" r=".6" fill="currentColor" stroke="none" /></g>}
    {platform === "facebook" && <g {...stroke}><rect x="3" y="3" width="18" height="18" rx="4" /><path d="M15.5 8h-1.8A2.2 2.2 0 0 0 11.5 10.2V21M9 13.5h5.5" /></g>}
    {platform === "youtube" && <g><rect x="2.5" y="5.5" width="19" height="13" rx="4" {...stroke} /><path d="M10 9.2v5.6l4.8-2.8z" fill="currentColor" /></g>}
    {platform === "tiktok" && <g {...stroke}><path d="M13.5 3.5v11a3.5 3.5 0 1 1-3.5-3.5" /><path d="M13.5 3.5c.4 2.6 2.4 4.4 5 4.6" /></g>}
    {platform === "linkedin" && <path fill="currentColor" d="M20.45 20.45h-3.55v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.36V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.38-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12zM7.12 20.45H3.56V9h3.56v11.45z" />}
    {platform === "x" && <g {...stroke}><path d="M4.5 4h4l11 16h-4z" /><path d="M19.5 4l-6.6 7.3M4.5 20l6.6-7.3" /></g>}
    {platform === "snapchat" && <g {...stroke}><path d="M12 3.5c2.8 0 4.7 2.1 4.7 4.8v2.6l1.9.8-1.9 1c-.5 1.9-2.3 3.3-4.7 3.3s-4.2-1.4-4.7-3.3l-1.9-1 1.9-.8V8.3c0-2.7 1.9-4.8 4.7-4.8z" /><path d="M7.5 18.5c1.4.6 2.9 1 4.5 1s3.1-.4 4.5-1" /></g>}
    {platform === "strava" && <g {...stroke}><path d="M6.5 14 11 4.5 15.5 14" /><path d="M13 14l2.5 5.5L18 14" /></g>}
  </svg>;
}
