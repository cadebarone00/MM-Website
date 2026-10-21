/** Website sign-out uses the existing local-session endpoint, never a second token store. */
export async function signOutWebsite(request: typeof fetch = fetch): Promise<string> {
  let endpoint: string | undefined;
  if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
    const registration = await navigator.serviceWorker.getRegistration("/").catch(() => undefined);
    endpoint = (await registration?.pushManager?.getSubscription().catch(() => null))?.endpoint;
  }
  const response = await request("/api/auth/signout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(endpoint ? { endpoint } : {}) });
  if (!response.ok || !(await response.json()).ok) throw new Error("Could not sign out");
  return "/login/email?next=%2Fdashboard";
}
