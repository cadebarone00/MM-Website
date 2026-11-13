"use client";
import { appApiBase } from "./appEnv";
import { appAccessToken } from "./appAuth";

/**
 * In the app, every screen's existing `fetch("/api/…")` goes to the live server with the app's login attached
 * (Authorization: Bearer) and no cookies. Installed once, before any screen loads (components/app/AppShell.tsx), so the
 * website's components work in the app without changes. Other requests are left alone.
 */
export function installAppFetch() {
  const w = window as Window & { __maroonAppFetch?: boolean };
  if (w.__maroonAppFetch) return;
  w.__maroonAppFetch = true;
  const original = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const url = new URL(raw, window.location.href);
    if (url.origin !== window.location.origin || !url.pathname.startsWith("/api/")) return original(input, init);
    const request = input instanceof Request ? input : null;
    const headers = new Headers(init?.headers ?? request?.headers);
    const token = await appAccessToken();
    if (token && !headers.has("authorization")) headers.set("authorization", `Bearer ${token}`);
    const body = init?.body ?? (request && !["GET", "HEAD"].includes(request.method) ? await request.clone().blob() : undefined);
    return original(appApiBase + url.pathname + url.search, { ...init, method: init?.method ?? request?.method, body, headers, credentials: "omit", mode: "cors" });
  };
}
