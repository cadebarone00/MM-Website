/**
 * Share a link with the phone's own share sheet (Apple / Google), so it can go by text, email, etc.
 * Order: the native app's sheet (@capacitor/share) → the browser's (Web Share API) → copy to the clipboard.
 * A share the person cancels is just "cancelled" (we don't copy behind their back).
 */
export type ShareOutcome = "shared" | "copied" | "cancelled" | "failed";
export type ShareInput = { title: string; text: string; url: string };
type Sharer = ((input: ShareInput) => Promise<void>) | null;
export type ShareDeps = { native?: Sharer; webShare?: Sharer; copy?: ((text: string) => Promise<void>) | null };

const cancelled = (error: unknown) => {
  const e = error as { name?: string; message?: string } | null;
  return e?.name === "AbortError" || /cancel/i.test(e?.message ?? "");
};

async function defaultNative(): Promise<Sharer> {
  try {
    const { Capacitor } = await import("@capacitor/core");
    if (!Capacitor.isNativePlatform()) return null;
    const { Share } = await import("@capacitor/share");
    return async (input) => { await Share.share({ title: input.title, text: input.text, url: input.url, dialogTitle: input.title }); };
  } catch {
    return null;
  }
}

function defaultDeps(): Required<Omit<ShareDeps, "native">> {
  const nav = typeof navigator === "undefined" ? null : navigator;
  return {
    webShare: nav && typeof nav.share === "function" ? (input) => nav.share(input) : null,
    copy: nav?.clipboard ? (text) => nav.clipboard.writeText(text) : null,
  };
}

export async function shareLink(input: ShareInput, deps?: ShareDeps): Promise<ShareOutcome> {
  const base = defaultDeps();
  const native = deps && "native" in deps ? deps.native ?? null : await defaultNative();
  const webShare = deps && "webShare" in deps ? deps.webShare ?? null : base.webShare;
  const copy = deps && "copy" in deps ? deps.copy ?? null : base.copy;
  for (const sheet of [native, webShare]) {
    if (!sheet) continue;
    try {
      await sheet(input);
      return "shared";
    } catch (error) {
      if (cancelled(error)) return "cancelled";
      // A broken sheet: fall through to the next way.
    }
  }
  if (!copy) return "failed";
  try {
    await copy(input.url);
    return "copied";
  } catch {
    return "failed";
  }
}
