"use client";
import Image from "next/image";
import { ArrowRight } from "lucide-react";
import { isLive, isScheduled, readMinutes, statusLabel, videoSource, type RibbonItem, type RibbonPost } from "@/lib/content/ribbon";
import styles from "./Ribbon.module.css";

/** The site's own photos go through Next's image optimizer; uploaded ones (R2) and ones just picked (blob:) are shown as is. */
export const photoProps = (src: string) => ({ src, unoptimized: !src.startsWith("/") });

const tone = (item: RibbonItem, now: Date) => isLive(item, now) ? "live" : isScheduled(item, now) ? "scheduled" : item.status === "changes_requested" ? "back" : "draft";
export function StatusPill({ item }: { item: RibbonItem }) {
  const now = new Date();
  return <span className={styles.pill} data-tone={tone(item, now)}>{statusLabel(item, now)}</span>;
}

/** What the card's button says: a Story is read, a Quick video is watched, a Quick photo is viewed. */
export const cardAction = (post: RibbonPost) => post.format === "story" ? `Read · ${readMinutes(post)} min` : post.coverVideo ? "Watch" : "View";

/** A Quick post's video plays silently on the card itself as its cover; files only (a YouTube link needs a photo cover). */
export function CoverVideo({ src, className }: { src: string; className?: string }) {
  const video = videoSource(src);
  return video?.kind === "file" ? <video className={className} src={video.src} muted playsInline loop autoPlay preload="metadata" aria-hidden="true" /> : null;
}

/** One post, in the Featured trip card style. Without `onOpen` it's the editor's live preview (not tappable). */
export function RibbonPostCard({ post, onOpen, controls }: { post: RibbonPost; onOpen?: () => void; controls?: React.ReactNode }) {
  const quick = post.format === "quick";
  const body = <>
    {post.coverImage ? <Image {...photoProps(post.coverImage)} alt="" fill sizes="(max-width: 600px) 92vw, 1000px" />
      : post.coverVideo && <CoverVideo src={post.coverVideo} className={styles.cardVideo} />}
    <span className={styles.cardText}>
      <span className={styles.kicker}>The Maroon · {post.tab}</span>
      <span className={quick ? styles.quickMessage : styles.title}>{post.title || (quick ? "Your message goes here" : "Your headline goes here")}</span>
      {!quick && post.summary && <span className={styles.summary}>{post.summary}</span>}
    </span>
    <span className={styles.open}>{cardAction(post)} <ArrowRight size={14} aria-hidden="true" /></span>
  </>;
  return <div className={`${styles.cardWrap} ${post.status === "published" ? "" : styles.notLive}`}>
    {controls}
    {onOpen ? <button type="button" className={styles.card} onClick={onOpen} aria-label={`${post.title}. Open`}>{body}</button>
      : <div className={styles.card} role="img" aria-label={`Preview: ${post.title || "untitled post"}`}>{body}</div>}
  </div>;
}
