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
export interface MomentumEvent { id: string; cause: import('./momentumCopy').MomentumCause | null; subject_name: string | null; result_label: string | null; kind: 'score' | 'milestone'; title: string; detail: string; round_number: number; created_at: string }
