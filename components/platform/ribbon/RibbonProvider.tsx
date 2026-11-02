"use client";
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type { ContentRole, RibbonItem, Viewer } from "@/lib/content/ribbon";
import type { SaveMode } from "@/lib/content/ribbonSave";

export type { SaveMode };

export type RibbonSetup = { items: RibbonItem[]; role: ContentRole; profileId: string | null; sample: boolean; sampleIds?: { admin: string; poster: string }; invitedBy?: string | null };

type RibbonState = {
  items: RibbonItem[];
  /** The person's own role. */
  role: ContentRole;
  /** Who the screens are drawn for: the role, or a plain player while "Player" preview is on. */
  viewer: Viewer;
  previewAsPlayer: boolean;
  setPreviewAsPlayer: (on: boolean) => void;
  sample: boolean;
  /** Sample only: try the page as another role. */
  setSampleRole: (role: ContentRole) => void;
  /** These return a plain error message, or null when it worked. */
  save: (item: RibbonItem, mode: SaveMode, publishAt?: string | null) => Promise<string | null>;
  remove: (id: string) => Promise<string | null>;
  approve: (id: string, publishAt?: string | null) => Promise<string | null>;
  sendBack: (id: string, note: string) => Promise<string | null>;
  answerInvite: (accept: boolean) => Promise<string | null>;
  /** Sends a photo or video to storage and gives back its address. Sample: stays on this device. */
  upload: (file: File, itemId: string) => Promise<{ url: string } | { error: string }>;
  invitedBy: string | null;
  toast: string | null;
};

const RibbonContext = createContext<RibbonState | null>(null);
export const useRibbon = () => useContext(RibbonContext);

const OFFLINE = { ok: false, error: "Couldn't reach the server. Try again." };
/** One call to the content API. The server re-checks the person's role on every one. */
async function call(url: string, method: string, body?: object) {
  return fetch(url, { method, ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}) }).then((r) => r.json()).catch(() => OFFLINE);
}

/** Holds the ribbon content for the Play page. In sample mode (dev only) every change stays in this page's memory. */
export function RibbonProvider({ setup, children }: { setup: RibbonSetup; children: ReactNode }) {
  const [items, setItems] = useState(setup.items);
  const [role, setRole] = useState<ContentRole>(setup.role);
  const [profileId, setProfileId] = useState(setup.profileId);
  const [previewAsPlayer, setPreviewAsPlayer] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const value = useMemo<RibbonState>(() => {
    const now = () => new Date().toISOString();
    const say = (message: string) => { setToast(message); window.setTimeout(() => setToast((t) => t === message ? null : t), 2400); };
    const put = (next: RibbonItem) => setItems((list) => list.some((i) => i.id === next.id) ? list.map((i) => i.id === next.id ? next : i) : [next, ...list]);
    return {
      items, role, previewAsPlayer, setPreviewAsPlayer, sample: setup.sample, toast,
      viewer: previewAsPlayer ? { role: null, profileId: null } : { role, profileId },
      setSampleRole: (next) => {
        setRole(next); setPreviewAsPlayer(false);
        setProfileId(next === "admin" ? setup.sampleIds?.admin ?? null : next === "poster" || next === "invited" ? setup.sampleIds?.poster ?? null : null);
      },
      invitedBy: setup.invitedBy ?? null,
      save: async (item, mode, publishAt = null) => {
        const poster = role !== "admin";
        const said = poster ? (mode === "submit" ? "Sent for approval" : "Draft saved")
          : mode === "publish" ? (item.kind === "trip_plan" ? "Featured trip updated" : "Published") : mode === "schedule" ? "Scheduled" : mode === "unpublish" ? "Unpublished. Only admins can see it now" : "Draft saved";
        if (!setup.sample) {
          const sent = await call("/api/content/items", "POST", { item, mode, publishAt });
          if (!sent.ok) return sent.error;
          put(sent.item); say(said);
          return null;
        }
        // The role decides what a save can do, whatever the screen asked for: a Poster can never publish.
        const status = poster ? (mode === "submit" ? "pending" : "draft") : mode === "draft" || mode === "unpublish" ? "draft" : "published";
        const when = !poster && mode === "schedule" ? publishAt : !poster && mode === "publish" ? now() : null;
        put({ ...item, status, publishAt: when, reviewNote: status === "pending" ? null : item.reviewNote, updatedAt: now() } as RibbonItem);
        say(said);
        return null;
      },
      remove: async (id) => {
        if (!setup.sample) { const sent = await call(`/api/content/items/${id}`, "DELETE"); if (!sent.ok) return sent.error; }
        setItems((list) => list.filter((i) => i.id !== id)); say("Deleted");
        return null;
      },
      approve: async (id, publishAt = null) => {
        const said = publishAt ? "Approved and scheduled" : "Approved and published";
        if (!setup.sample) {
          const sent = await call(`/api/content/items/${id}/review`, "POST", { action: "approve", publishAt });
          if (!sent.ok) return sent.error;
          put(sent.item); say(said);
          return null;
        }
        setItems((list) => list.map((i) => i.id === id ? { ...i, status: "published", publishAt: publishAt ?? now(), reviewNote: null, updatedAt: now() } : i));
        say(said);
        return null;
      },
      sendBack: async (id, note) => {
        if (!setup.sample) {
          const sent = await call(`/api/content/items/${id}/review`, "POST", { action: "send-back", note });
          if (!sent.ok) return sent.error;
          put(sent.item); say("Sent back with your note");
          return null;
        }
        setItems((list) => list.map((i) => i.id === id ? { ...i, status: "changes_requested", reviewNote: note, updatedAt: now() } : i));
        say("Sent back with your note");
        return null;
      },
      answerInvite: async (accept) => {
        if (!setup.sample) { const sent = await call("/api/content/team/answer", "POST", { accept }); if (!sent.ok) return sent.error; }
        setRole(accept ? "poster" : null); say(accept ? "You're on the content team" : "Invite declined");
        return null;
      },
      upload: async (file, itemId) => {
        if (setup.sample) return { url: URL.createObjectURL(file) };
        const signed = await call("/api/content/upload/sign", "POST", { contentType: file.type, size: file.size, itemId });
        if (!signed.ok) return { error: signed.error };
        const sent = await fetch(signed.url, { method: "PUT", headers: { "Content-Type": file.type.toLowerCase() }, body: file }).catch(() => null);
        return sent?.ok ? { url: signed.publicUrl } : { error: "That file didn't upload. Check your connection and try again." };
      },
    };
  }, [items, role, profileId, previewAsPlayer, toast, setup.sample, setup.sampleIds, setup.invitedBy]);

  return <RibbonContext.Provider value={value}>{children}</RibbonContext.Provider>;
}
