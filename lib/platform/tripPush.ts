/** Browser push endpoint input is untrusted: restrict destinations before any server network access. */
export interface TripPushSubscription { endpoint: string; keys: { p256dh: string; auth: string } }
export function pushEndpointAllowed(endpoint: string): boolean {
 try {
  const u = new URL(endpoint);
  return u.protocol === 'https:' && !u.username && !u.password && (!u.port || u.port === '443') &&
   (['fcm.googleapis.com', 'updates.push.services.mozilla.com', 'web.push.apple.com'].includes(u.hostname) ||
    /^[a-z0-9-]+\.notify\.windows\.com$/.test(u.hostname));
 } catch { return false; }
}
export function pushSubscriptionFrom(value: unknown): TripPushSubscription | null {
 if (!value || typeof value !== 'object') return null;
 const s = value as Partial<TripPushSubscription>;
 if (typeof s.endpoint !== 'string' || s.endpoint.length > 2048 || !pushEndpointAllowed(s.endpoint)) return null;
 if (!s.keys || !/^[A-Za-z0-9_-]{87}$/.test(s.keys.p256dh) || !/^[A-Za-z0-9_-]{22}$/.test(s.keys.auth)) return null;
 return { endpoint: s.endpoint, keys: { p256dh: s.keys.p256dh, auth: s.keys.auth } };
}
/** Closed-app alerts are offered only while something really sends them: push keys, the job secret AND a scheduler calling
 * /api/internal/trip-push every minute, declared with TRIP_PUSH_DELIVERY=on. Vercel Hobby can't run it that often, so
 * vercel.json no longer schedules it; it stays off until another scheduler (e.g. Supabase Cron) is set up. */
export function tripPushDeliveryEnabled(env: Record<string, string | undefined>): boolean {
 return Boolean(env.WEB_PUSH_VAPID_PRIVATE_KEY && env.NEXT_PUBLIC_WEB_PUSH_VAPID_KEY && env.WEB_PUSH_VAPID_SUBJECT && env.CRON_SECRET) &&
  env.TRIP_PUSH_DELIVERY === 'on';
}
export interface MomentumEvent { id: string; cause: import('./momentumCopy').MomentumCause | null; subject_name: string | null; result_label: string | null; kind: 'score' | 'milestone'; title: string; detail: string; round_number: number; created_at: string }
