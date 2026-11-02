"use client";
import { useState } from "react";
import { Pencil, Plus } from "lucide-react";
import { canEdit, canPost, featuredTrip, tabPosts, type FeaturedTrip, type RibbonItem, type RibbonPost, type RibbonTab } from "@/lib/content/ribbon";
import { RibbonPostCard, StatusPill } from "./RibbonPostCard";
import { RibbonArticle } from "./RibbonArticle";
import { useRibbon } from "./RibbonProvider";
import { RibbonEditor } from "./RibbonEditor";
import styles from "./Ribbon.module.css";

/** A tab's posts: "+ Add to [tab]" for the content team, then the posts this viewer may see, newest first. `showEmpty` is for tabs with nothing else on them, so they don't look broken. */
export function RibbonTabPosts({ tab, showEmpty = false }: { tab: RibbonTab; showEmpty?: boolean }) {
  const ribbon = useRibbon();
  const [editing, setEditing] = useState<RibbonItem | "new" | null>(null);
  const [reading, setReading] = useState<RibbonPost | null>(null);
  const noPosts = showEmpty ? <div className={styles.posts}><p className={styles.empty}>No posts yet.</p></div> : null;
  if (!ribbon) return noPosts;
  const { viewer, items } = ribbon;
  const posts = tabPosts(items, tab, viewer, new Date());
  if (!posts.length && !canPost(viewer)) return noPosts;
  return <div className={styles.posts}>
    {canPost(viewer) && <button type="button" className={styles.add} onClick={() => setEditing("new")}><span><Plus size={16} aria-hidden="true" /></span>Add to {tab}</button>}
    {posts.map((post) => <RibbonPostCard key={post.id} post={post} onOpen={() => setReading(post)}
      controls={viewer.role && <div className={styles.overlay}><StatusPill item={post} />
        {canEdit(post, viewer) && <button type="button" className={styles.edit} onClick={() => setEditing(post)}><Pencil size={13} aria-hidden="true" />Edit</button>}</div>} />)}
    {!posts.length && <p className={styles.empty}>No {tab} posts yet. Tap Add to put up the first one.</p>}
    {editing && <RibbonEditor tab={tab} kind="post" item={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    {reading && <RibbonArticle post={reading} more={posts.filter((p) => p.id !== reading.id && p.status === "published")} onOpen={setReading} onClose={() => setReading(null)} />}
  </div>;
}

/** Explore's featured trip: this week's live plan, or the built-in one. Admins get Swap trip / Edit trip over the card. */
export function useFeaturedTrip(fallback: FeaturedTrip) {
  const ribbon = useRibbon();
  const [editing, setEditing] = useState<RibbonItem | "new" | null>(null);
  if (!ribbon) return { trip: fallback, controls: null, editor: null };
  const { trip, item } = featuredTrip(ribbon.items, new Date(), fallback);
  const { viewer } = ribbon;
  const controls = viewer.role && canPost(viewer) ? <div className={styles.overlay}>
    {item ? <StatusPill item={item} /> : <span className={styles.pill}>Built-in trip</span>}
    <button type="button" className={styles.edit} onClick={() => setEditing("new")}><Pencil size={13} aria-hidden="true" />{viewer.role === "admin" ? "Swap trip" : "Suggest a trip"}</button>
  </div> : null;
  const editor = editing && <RibbonEditor tab="Explore" kind="trip_plan" item={editing === "new" ? null : editing} startTrip={trip} onClose={() => setEditing(null)} />;
  return { trip, controls, editor };
}
