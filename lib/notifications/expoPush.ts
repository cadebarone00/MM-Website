/**
 * Phone notifications through Expo's push service (project_specs.md "Expo app Step 6"). Pure, unit tested: the message
 * each phone gets, the batches sent, and what each answer means. The sending itself is lib/notifications/pushServer.ts.
 * Docs: https://docs.expo.dev/push-notifications/sending-notifications/ (max 100 messages a request; tickets come back
 * in the same order; "DeviceNotRegistered" = the app was removed or notifications were turned off → forget the token).
 */
import { safeAppLink, TITLE_LIMIT, BODY_LIMIT } from "./format.ts";

export const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
export const EXPO_BATCH = 100;
const TOKEN = /^(Exponent|Expo)PushToken\[[A-Za-z0-9_-]{10,200}\]$/;

export const isExpoPushToken = (value: unknown): value is string => typeof value === "string" && TOKEN.test(value);
export const isPushPlatform = (value: unknown): value is "ios" | "android" => value === "ios" || value === "android";

export type PushContent = { title: string; body: string; link: string; kind: string; groupId?: string | null };
export type ExpoMessage = { to: string; title: string; body: string; sound: "default"; data: { link: string; kind: string }; threadId?: string; channelId: "default" };

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

/** One message for one phone: short title / body, the in-app link to open on tap, grouped by trip on iPhone. */
export function expoMessage(token: string, content: PushContent): ExpoMessage {
  return {
    to: token, title: clip(content.title, TITLE_LIMIT), body: clip(content.body, BODY_LIMIT), sound: "default", channelId: "default",
    data: { link: safeAppLink(content.link), kind: content.kind },
    ...(content.groupId ? { threadId: content.groupId } : {}),
  };
}

/** Messages in batches of at most 100 (Expo's limit per request). */
export function batches<T>(items: T[], size = EXPO_BATCH): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export type TicketOutcome = { token: string; outcome: "sent" | "forget" | "failed" };
/** Expo's answer for a batch → per token: sent, forget the token (phone gone / notifications off), or failed. */
export function ticketOutcomes(messages: Pick<ExpoMessage, "to">[], reply: unknown): TicketOutcome[] {
  const data = reply && typeof reply === "object" && Array.isArray((reply as { data?: unknown }).data) ? (reply as { data: unknown[] }).data : null;
  return messages.map((message, i) => {
    const ticket = data?.[i] as { status?: unknown; details?: { error?: unknown } } | undefined;
    if (ticket?.status === "ok") return { token: message.to, outcome: "sent" };
    if (ticket?.details?.error === "DeviceNotRegistered") return { token: message.to, outcome: "forget" };
    return { token: message.to, outcome: "failed" };
  });
}
