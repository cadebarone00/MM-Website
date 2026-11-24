import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { featuredTrip, tabPosts, type FeaturedTrip, type RibbonItem, type RibbonPost, type RibbonTab } from "@/lib/content/ribbon";
import { BUILT_IN_TRIP } from "@/lib/content/builtInTrip";
import { apiGet } from "./api.ts";

/**
 * Play's On The Range content, loaded once from /api/app/play (the same posts and weekly featured trip as the website)
 * and shared by Play home, On The Range, the trip sheet and the article screen.
 * The app only shows published posts: writing and approving posts stays on the desktop website.
 */
type PlayReply = { signedIn: boolean; ribbon?: { items: RibbonItem[] } };
type State = { status: "loading" } | { status: "ready"; items: RibbonItem[] } | { status: "error"; message: string };

type PlayData = {
  state: State;
  reload: () => void;
  posts: (tab: RibbonTab) => RibbonPost[];
  post: (id: string) => RibbonPost | null;
  trip: FeaturedTrip;
};

const READER = { role: null, profileId: null } as const;
const PlayDataContext = createContext<PlayData | null>(null);

export function PlayDataProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({ status: "loading" });
  const load = useCallback(async () => {
    setState({ status: "loading" });
    const reply = await apiGet<PlayReply>("/api/app/play");
    setState(reply.ok ? { status: "ready", items: Array.isArray(reply.data?.ribbon?.items) ? reply.data.ribbon.items : [] } : { status: "error", message: reply.error });
  }, []);
  useEffect(() => { void load(); }, [load]);

  const value = useMemo<PlayData>(() => {
    const items = state.status === "ready" ? state.items : [];
    const now = new Date();
    return {
      state,
      reload: () => { void load(); },
      posts: (tab) => tabPosts(items, tab, READER, now),
      post: (id) => items.find((item): item is RibbonPost => item.kind === "post" && item.id === id) ?? null,
      trip: featuredTrip(items, now, BUILT_IN_TRIP).trip,
    };
  }, [state, load]);

  return <PlayDataContext.Provider value={value}>{children}</PlayDataContext.Provider>;
}

export function usePlayData(): PlayData {
  const value = useContext(PlayDataContext);
  if (!value) throw new Error("usePlayData needs PlayDataProvider");
  return value;
}
