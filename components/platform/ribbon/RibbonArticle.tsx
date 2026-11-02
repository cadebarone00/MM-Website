"use client";
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { ArrowLeft, ArrowRight, X } from "lucide-react";
import { readMinutes, videoSource, type RibbonPost } from "@/lib/content/ribbon";
import { cardAction, CoverVideo, photoProps } from "./RibbonPostCard";
import styles from "./RibbonArticle.module.css";

const published = (post: RibbonPost) => new Date(post.publishAt ?? post.updatedAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

/** A video that plays inside the article: YouTube as an embed, an uploaded file with the phone's own controls. */
function Video({ url, caption }: { url: string; caption?: string }) {
  const video = videoSource(url);
  if (!video) return null;
  return <figure className={styles.figure}>
    <div className={styles.videoFrame}>
      {video.kind === "youtube" ? <iframe src={video.src} title={caption || "Video"} allow="encrypted-media; picture-in-picture; fullscreen" allowFullScreen loading="lazy" />
        : <video src={video.src} controls playsInline preload="metadata" />}
    </div>
    {caption && <figcaption>{caption}</figcaption>}
  </figure>;
}

/**
 * Full-screen post page. A Story reads like a sports-site article (photo, headline, standfirst, date and read time,
 * then the body); a Quick post is the photo or video with its message. "More from [tab]" at the end. No author shown.
 */
export function RibbonArticle({ post, more, onOpen, onClose }: { post: RibbonPost; more: RibbonPost[]; onOpen: (post: RibbonPost) => void; onClose: () => void }) {
  const top = useRef<HTMLDivElement>(null);
  useEffect(() => { top.current?.scrollTo({ top: 0 }); }, [post.id]);
  useEffect(() => {
    const close = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [onClose]);
  const quick = post.format === "quick";
  // Rendered at the page root so it fills the screen even when opened from inside the editor sheet.
  return createPortal(<div className={styles.page} ref={top} role="dialog" aria-modal="true" aria-label={post.title}>
    <header className={styles.top}>
      <button type="button" className={styles.back} onClick={onClose}><ArrowLeft size={18} aria-hidden="true" /> {post.tab}</button>
      <span className={styles.brand}>The Maroon</span>
      <button type="button" className={styles.close} aria-label="Close" onClick={onClose}><X size={20} aria-hidden="true" /></button>
    </header>

    <article className={styles.article}>
      {quick ? <>
        <div className={styles.quickMedia}>
          {post.coverVideo ? (videoSource(post.coverVideo)?.kind === "youtube" ? <Video url={post.coverVideo} />
            : <video src={post.coverVideo} controls playsInline autoPlay muted loop preload="metadata" />)
            : post.coverImage && <Image {...photoProps(post.coverImage)} alt="" fill sizes="(max-width: 700px) 100vw, 700px" priority />}
        </div>
        <div className={styles.inner}>
          <p className={styles.kicker}>The Maroon · {post.tab}</p>
          <p className={styles.message}>{post.title}</p>
          <p className={styles.dateline}>{published(post)}</p>
        </div>
      </> : <>
        <div className={styles.hero}>{post.coverImage && <Image {...photoProps(post.coverImage)} alt="" fill sizes="(max-width: 700px) 100vw, 700px" priority />}</div>
        <div className={styles.inner}>
          <p className={styles.kicker}>The Maroon · {post.tab}</p>
          <h1 className={styles.headline}>{post.title}</h1>
          {post.summary && <p className={styles.standfirst}>{post.summary}</p>}
          <p className={styles.dateline}>{published(post)} · {readMinutes(post)} min read</p>
          <div className={styles.body}>
            {post.blocks.map((block, i) => {
              switch (block.type) {
                case "text": return block.text.trim() ? <p key={i}>{block.text}</p> : null;
                case "heading": return block.text.trim() ? <h2 key={i}>{block.text}</h2> : null;
                case "quote": return block.text.trim() ? <blockquote key={i}>{block.text}</blockquote> : null;
                case "photo": return block.src ? <figure key={i} className={styles.figure}><div className={styles.photo}><Image {...photoProps(block.src)} alt={block.caption ?? ""} fill sizes="(max-width: 700px) 100vw, 700px" /></div>{block.caption && <figcaption>{block.caption}</figcaption>}</figure> : null;
                case "video": return <Video key={i} url={block.url} caption={block.caption} />;
                case "link": return block.url ? <a key={i} className={styles.linkButton} href={block.url} target={block.url.startsWith("/") ? undefined : "_blank"} rel="noreferrer">{block.label || "Open link"} <ArrowRight size={16} aria-hidden="true" /></a> : null;
              }
            })}
          </div>
        </div>
      </>}

      {more.length > 0 && <section className={styles.more} aria-labelledby="more-title">
        <h2 id="more-title">More from {post.tab}</h2>
        <ul>{more.slice(0, 3).map((item) => <li key={item.id}><button type="button" onClick={() => onOpen(item)}>
          <span className={styles.thumb}>{item.coverImage ? <Image {...photoProps(item.coverImage)} alt="" fill sizes="96px" /> : item.coverVideo && <CoverVideo src={item.coverVideo} />}</span>
          <span className={styles.moreText}><b>{item.title}</b><span>{cardAction(item)}</span></span>
        </button></li>)}</ul>
      </section>}
    </article>
  </div>, document.body);
}
