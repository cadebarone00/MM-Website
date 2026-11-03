"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { linkNeedsRefresh, type JoinLink } from "./golfTripJoinLinks";

export type JoinLinkState = { status: "loading" | "ok" | "off" | "error"; link: JoinLink | null; message: string };

/**
 * The trip's 30-minute invite link for the card / pop-up. `fresh()` re-asks the server right before a Copy or Share
 * when the shown link is nearly expired, so nobody hands out a dead link. `tripId` null = a preview with `sample`.
 */
export function useTripJoinLink(tripId: string | null, sample?: JoinLink) {
  const [state, setState] = useState<JoinLinkState>(sample ? { status: "ok", link: sample, message: "" } : { status: "loading", link: null, message: "" });
  const linkRef = useRef<JoinLink | null>(sample ?? null);

  const request = useCallback(async (method: "GET" | "POST"): Promise<JoinLink | null> => {
    if (!tripId) return linkRef.current;
    try {
      const response = await fetch(`/api/golf-trips/${tripId}/join-link`, { method, cache: "no-store" });
      const body = await response.json().catch(() => null) as (JoinLink & { error?: string }) | null;
      if (response.ok && body?.code) {
        linkRef.current = { code: body.code, url: body.url, expiresAt: body.expiresAt };
        setState({ status: "ok", link: linkRef.current, message: "" });
        return linkRef.current;
      }
      setState(current => ({ status: response.status === 503 ? "off" : "error", link: current.link, message: body?.error ?? "Couldn't get the invite link." }));
    } catch {
      setState(current => ({ status: "error", link: current.link, message: "We couldn't reach the server." }));
    }
    return null;
  }, [tripId]);

  useEffect(() => {
    if (!tripId) return;
    void request("GET");
    // Re-fetch when the shown link reaches its last 5 minutes.
    const timer = setInterval(() => { if (linkNeedsRefresh(linkRef.current, Date.now())) void request("GET"); }, 30_000);
    return () => clearInterval(timer);
  }, [tripId, request]);

  const fresh = useCallback(async () => linkNeedsRefresh(linkRef.current, Date.now()) ? request("GET") : linkRef.current, [request]);
  const reset = useCallback(() => request("POST"), [request]);
  return { state, fresh, reset };
}
