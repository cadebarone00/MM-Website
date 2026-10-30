"use client";
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type { ContentRole, RibbonItem, Viewer } from "@/lib/content/ribbon";

/** Admin saves: publish now / schedule / draft / unpublish. Poster saves: send for approval / draft. */
export type SaveMode = "publish" | "schedule" | "draft" | "submit" | "unpublish";

export type RibbonSetup = { items: RibbonItem[]; role: ContentRole; profileId: string | null; sample: boolean; sampleIds?: { admin: string; poster: string } };

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
  save: (item: RibbonItem, mode: SaveMode, publishAt?: string | null) => void;
  remove: (id: string) => void;
  approve: (id: string, publishAt?: string | null) => void;
  sendBack: (id: string, note: string) => void;
  answerInvite: (accept: boolean) => void;
  toast: string | null;
};

const RibbonContext = createContext<RibbonState | null>(null);
export const useRibbon = () => useContext(RibbonContext);

/**
 * Holds the ribbon content for the Play page. In sample mode (dev only) every change stays in this page's memory; the
 * saved-content version will send the same actions to the server, which re-checks the person's role on every save.
 */
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
      save: (item, mode, publishAt = null) => {
        // The role decides what a save can do, whatever the screen asked for: a Poster can never publish.
        const poster = role !== "admin";
        const status = poster ? (mode === "submit" ? "pending" : "draft") : mode === "draft" || mode === "unpublish" ? "draft" : "published";
        const when = !poster && mode === "schedule" ? publishAt : !poster && mode === "publish" ? now() : null;
        put({ ...item, status, publishAt: when, reviewNote: status === "pending" ? null : item.reviewNote, updatedAt: now() } as RibbonItem);
        say(poster ? (status === "pending" ? "Sent for approval" : "Draft saved")
          : mode === "publish" ? (item.kind === "trip_plan" ? "Featured trip updated" : "Published") : mode === "schedule" ? "Scheduled" : mode === "unpublish" ? "Unpublished. Only admins can see it now" : "Draft saved");
      },
      remove: (id) => { setItems((list) => list.filter((i) => i.id !== id)); say("Deleted"); },
      approve: (id, publishAt = null) => {
        setItems((list) => list.map((i) => i.id === id ? { ...i, status: "published", publishAt: publishAt ?? now(), reviewNote: null, updatedAt: now() } : i));
        say(publishAt ? "Approved and scheduled" : "Approved and published");
      },
      sendBack: (id, note) => {
        setItems((list) => list.map((i) => i.id === id ? { ...i, status: "changes_requested", reviewNote: note, updatedAt: now() } : i));
        say("Sent back with your note");
      },
      answerInvite: (accept) => { setRole(accept ? "poster" : null); say(accept ? "You're on the content team" : "Invite declined"); },
    };
  }, [items, role, profileId, previewAsPlayer, toast, setup.sample, setup.sampleIds]);

  return <RibbonContext.Provider value={value}>{children}</RibbonContext.Provider>;
}
