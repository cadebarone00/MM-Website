"use client";
import { useState } from "react";
import { GolfTripActionSheet } from "../GolfTripActionSheet";
import { canPublish, type FeaturedTrip, type RibbonBlock, type RibbonItem, type RibbonPost, type RibbonTab, type RibbonTripPlan, type TripTier } from "@/lib/content/ribbon";
import { useRibbon, type SaveMode } from "./RibbonProvider";
import { RibbonPostCard } from "./RibbonPostCard";
import { TripPromosPreview } from "./TripPreview";
import { RibbonArticle } from "./RibbonArticle";
import styles from "./Ribbon.module.css";

const BLOCK_LABELS: Record<RibbonBlock["type"], string> = { text: "Paragraph", heading: "Subheading", quote: "Quote", photo: "Photo", video: "Video", link: "Link button" };
const NEW_BLOCK: Record<RibbonBlock["type"], RibbonBlock> = { text: { type: "text", text: "" }, heading: { type: "heading", text: "" }, quote: { type: "quote", text: "" }, photo: { type: "photo", src: "", caption: "" }, video: { type: "video", url: "", caption: "" }, link: { type: "link", label: "", url: "" } };
const lines = (text: string) => text.split("\n").map((l) => l.trim()).filter(Boolean);
/** "Thu · Arrive PSP" (or "Thu: …") per line ↔ { day, plan }. */
const parseDays = (text: string) => lines(text).map((l) => { const [day, ...rest] = l.split(/\s*[·:]\s*/); return { day: day.slice(0, 4), plan: rest.join(" · ") }; });
const toLocalInput = (iso: string | null) => iso ? new Date(new Date(iso).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "";

/**
 * Add / Edit sheet for a post (any tab) or the Explore weekly trip plan. Admins: Publish now / Schedule / Save draft
 * (+ Unpublish / Delete when editing). Posters: Send for approval / Save draft (+ Delete their own draft).
 */
export function RibbonEditor({ tab, kind, item, startTrip, onClose }: { tab: RibbonTab; kind: "post" | "trip_plan"; item: RibbonItem | null; startTrip?: FeaturedTrip; onClose: () => void }) {
  const ribbon = useRibbon()!;
  const admin = canPublish(ribbon.viewer);
  const [draft, setDraft] = useState<RibbonItem>(() => item ?? (kind === "post"
    ? { id: `new-${Date.now()}`, kind: "post", format: "story", tab, title: "", summary: "", coverImage: "", blocks: [], status: "draft", publishAt: null, createdBy: ribbon.viewer.profileId ?? "", updatedAt: new Date().toISOString() }
    : { id: `new-${Date.now()}`, kind: "trip_plan", tab: "Explore", status: "draft", publishAt: null, createdBy: ribbon.viewer.profileId ?? "", updatedAt: new Date().toISOString(),
        trip: { ...(startTrip ?? { city: "", region: "", length: "", players: 4, image: "", tiers: [] }), city: "", tiers: (startTrip?.tiers ?? []).map((t) => ({ ...t })) } }));
  const [when, setWhen] = useState(toLocalInput(item?.publishAt ?? null));
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [fullPreview, setFullPreview] = useState(false);
  const isNew = !item;
  const post = draft.kind === "post" ? draft : null;
  const trip = draft.kind === "trip_plan" ? draft.trip : null;
  const setPost = (changes: Partial<RibbonPost>) => setDraft((d) => ({ ...d, ...changes }) as RibbonItem);
  const setTrip = (changes: Partial<FeaturedTrip>) => setDraft((d) => ({ ...(d as RibbonTripPlan), trip: { ...(d as RibbonTripPlan).trip, ...changes } }));
  const setTier = (i: number, changes: Partial<TripTier>) => trip && setTrip({ tiers: trip.tiers.map((t, n) => n === i ? { ...t, ...changes } : t) });
  const pickPhoto = (file: File | undefined, apply: (src: string) => void) => { if (file) apply(URL.createObjectURL(file)); };

  function save(mode: SaveMode) {
    setError(null);
    if (post && !post.title.trim()) return setError(post.format === "quick" ? "Add a short message to go with it." : "Add a headline so players know what the story is.");
    if (post?.format === "quick" && !post.coverImage && !post.coverVideo) return setError("Add a photo or a video.");
    if (trip && !trip.city.trim()) return setError("Add the city so players know where the trip is.");
    if (trip && !trip.tiers.length) return setError("Add at least one price level.");
    if ((post?.format === "story" && !post.coverImage) || (trip && !trip.image)) return setError("Add a cover photo. Every card needs one.");
    if (mode === "schedule") {
      if (!when) return setError("Pick a date and time, then press Schedule.");
      if (new Date(when) <= new Date()) return setError("Pick a time in the future, or press Publish now.");
    }
    ribbon.save(draft, mode, mode === "schedule" ? new Date(when).toISOString() : null);
    onClose();
  }

  const title = kind === "trip_plan" ? (admin ? "This week's trip" : "Suggest a trip") : isNew ? "New post" : "Edit post";
  return <GolfTripActionSheet label={title} onClose={onClose} className={styles.sheet}>
    <p className={styles.where}>{kind === "trip_plan" ? "Explore · Featured trip" : `${isNew ? "Adding to" : "Editing"} ${tab}`}</p>
    <h2 className={styles.sheetTitle}>{title}</h2>
    {draft.status === "changes_requested" && draft.reviewNote && <p className={styles.note}>Sent back: “{draft.reviewNote}”</p>}
    {kind === "trip_plan" && <p className={styles.hint}>{admin ? "Publishing replaces the featured trip on Explore for everyone. If nothing is live, Palm Springs shows." : "Cade or Cam will check it before it goes live."}</p>}

    {post && <div className={styles.formats} role="group" aria-label="Kind of post">
      <button type="button" aria-pressed={post.format === "story"} onClick={() => setPost({ format: "story", coverVideo: null })}>Story<span>An article: headline, photos, video</span></button>
      <button type="button" aria-pressed={post.format === "quick"} onClick={() => setPost({ format: "quick", summary: "", blocks: [] })}>Quick post<span>One photo or video + a message</span></button>
    </div>}

    {post?.format === "quick" ? <div className={styles.mediaChoice}>
      <label className={styles.photo} data-added={Boolean(post.coverImage)}>{post.coverImage ? "Photo added" : "Add a photo"}
        <input type="file" accept="image/*" aria-label="Photo" onChange={(e) => pickPhoto(e.target.files?.[0], (src) => setPost({ coverImage: src, coverVideo: null }))} /></label>
      <label className={styles.photo} data-added={Boolean(post.coverVideo)}>{post.coverVideo ? "Video added" : "Add a video"}
        <input type="file" accept="video/*" aria-label="Video" onChange={(e) => pickPhoto(e.target.files?.[0], (src) => setPost({ coverVideo: src, coverImage: "" }))} /></label>
    </div> : <label className={styles.photo} data-added={Boolean(post?.coverImage || trip?.image)}>
      {post?.coverImage || trip?.image ? "Cover photo added · tap to change" : "Tap to add a cover photo"}
      <input type="file" accept="image/*" aria-label="Cover photo" onChange={(e) => pickPhoto(e.target.files?.[0], (src) => post ? setPost({ coverImage: src }) : setTrip({ image: src }))} />
    </label>}

    {post?.format === "quick" && <div className={styles.field}><label className={styles.label} htmlFor="ribbon-title">Message</label>
      <textarea id="ribbon-title" className={styles.input} maxLength={200} value={post.title} placeholder="Say something short about it…" onChange={(e) => setPost({ title: e.target.value })} />
      <p className={styles.hint}>{200 - post.title.length} characters left</p></div>}

    {post?.format === "story" && <>
      <div className={styles.field}><label className={styles.label} htmlFor="ribbon-title">Headline</label>
        <input id="ribbon-title" className={styles.input} maxLength={90} value={post.title} placeholder={tab === "Courses" ? "Course of the week: …" : "Give it a headline"} onChange={(e) => setPost({ title: e.target.value })} /></div>
      <div className={styles.field}><label className={styles.label} htmlFor="ribbon-summary">Intro line</label>
        <textarea id="ribbon-summary" className={styles.input} maxLength={240} value={post.summary} placeholder="One or two sentences that hook the reader. Shows on the card." onChange={(e) => setPost({ summary: e.target.value })} /></div>
      <div className={styles.field}><span className={styles.label}>The story</span>
        <div className={styles.blocks}>{post.blocks.map((block, i) => {
          const put = (next: RibbonBlock) => setPost({ blocks: post.blocks.map((b, n) => n === i ? next : b) });
          const move = (by: number) => { const list = [...post.blocks]; const [b] = list.splice(i, 1); list.splice(i + by, 0, b); setPost({ blocks: list }); };
          return <div key={i} className={styles.block}>
            <div className={styles.blockHead}><span className={styles.label}>{BLOCK_LABELS[block.type]}</span>
              <span>{i > 0 && <button type="button" className={styles.remove} style={{ color: "#6b5a50" }} aria-label="Move up" onClick={() => move(-1)}>↑</button>}
                {i < post.blocks.length - 1 && <button type="button" className={styles.remove} style={{ color: "#6b5a50" }} aria-label="Move down" onClick={() => move(1)}>↓</button>}
                <button type="button" className={styles.remove} onClick={() => setPost({ blocks: post.blocks.filter((_, n) => n !== i) })}>Remove</button></span></div>
            {(block.type === "text" || block.type === "quote") && <textarea className={styles.input} aria-label={BLOCK_LABELS[block.type]} value={block.text} placeholder={block.type === "quote" ? "Something someone said" : "Write here…"} onChange={(e) => put({ type: block.type, text: e.target.value })} />}
            {block.type === "heading" && <input className={styles.input} aria-label="Subheading" value={block.text} placeholder="A short section title" onChange={(e) => put({ type: "heading", text: e.target.value })} />}
            {block.type === "photo" && <>
              <label className={styles.photo} data-added={Boolean(block.src)}>{block.src ? "Photo added · tap to change" : "Tap to add a photo"}
                <input type="file" accept="image/*" aria-label="Photo" onChange={(e) => pickPhoto(e.target.files?.[0], (src) => put({ ...block, src }))} /></label>
              <input className={styles.input} aria-label="Photo caption" placeholder="Caption (optional)" value={block.caption ?? ""} onChange={(e) => put({ ...block, caption: e.target.value })} /></>}
            {block.type === "video" && <>
              <label className={styles.photo} data-added={block.url.startsWith("blob:")}>{block.url.startsWith("blob:") ? "Video added · tap to change" : "Tap to upload a video"}
                <input type="file" accept="video/*" aria-label="Upload video" onChange={(e) => pickPhoto(e.target.files?.[0], (url) => put({ ...block, url }))} /></label>
              {!block.url.startsWith("blob:") && <input className={styles.input} aria-label="YouTube link" placeholder="…or paste a YouTube link" value={block.url} onChange={(e) => put({ ...block, url: e.target.value })} />}
              <input className={styles.input} aria-label="Video caption" placeholder="Caption (optional)" value={block.caption ?? ""} onChange={(e) => put({ ...block, caption: e.target.value })} /></>}
            {block.type === "link" && <div className={styles.row2}>
              <input className={styles.input} aria-label="Button words" placeholder="Book a tee time" value={block.label} onChange={(e) => put({ ...block, label: e.target.value })} />
              <input className={styles.input} aria-label="Link address" placeholder="https://…" value={block.url} onChange={(e) => put({ ...block, url: e.target.value })} /></div>}
          </div>;
        })}</div>
        <div className={styles.adds}>{(["text", "heading", "photo", "video", "quote", "link"] as const).map((type) => <button key={type} type="button"
          onClick={() => setPost({ blocks: [...post.blocks, { ...NEW_BLOCK[type] }] })}>+ {BLOCK_LABELS[type]}</button>)}</div>
      </div>
    </>}

    {trip && <>
      <div className={styles.row2}>
        <div className={styles.field}><label className={styles.label} htmlFor="trip-city">City</label><input id="trip-city" className={styles.input} value={trip.city} placeholder="Scottsdale" onChange={(e) => setTrip({ city: e.target.value })} /></div>
        <div className={styles.field}><label className={styles.label} htmlFor="trip-region">State</label><input id="trip-region" className={styles.input} value={trip.region} placeholder="Arizona" onChange={(e) => setTrip({ region: e.target.value })} /></div>
      </div>
      <div className={styles.row2}>
        <div className={styles.field}><label className={styles.label} htmlFor="trip-length">Length</label><input id="trip-length" className={styles.input} value={trip.length} placeholder="3 nights · 4 rounds" onChange={(e) => setTrip({ length: e.target.value })} /></div>
        <div className={styles.field}><label className={styles.label} htmlFor="trip-players">Players</label><input id="trip-players" className={styles.input} type="number" min={1} max={48} value={trip.players} onChange={(e) => setTrip({ players: Number(e.target.value) || 1 })} /></div>
      </div>
      {trip.tiers.map((tier, i) => <div key={i} className={styles.tier}>
        <div className={styles.blockHead}><span className={styles.label}>Price level {i + 1}</span>
          {trip.tiers.length > 1 && <button type="button" className={styles.remove} onClick={() => setTrip({ tiers: trip.tiers.filter((_, n) => n !== i) })}>Remove</button>}</div>
        <div className={styles.row2}>
          <input className={styles.input} aria-label="Level name" placeholder="Standard" value={tier.label} onChange={(e) => setTier(i, { label: e.target.value, id: e.target.value.toLowerCase() || `tier-${i}` })} />
          <input className={styles.input} aria-label="Price per person" placeholder="$1,250" value={tier.price} onChange={(e) => setTier(i, { price: e.target.value })} />
        </div>
        <input className={styles.input} aria-label="Lodging" placeholder="Where you stay" value={tier.stay} onChange={(e) => setTier(i, { stay: e.target.value })} />
        <textarea className={styles.input} aria-label="Courses, one per line" placeholder={"Courses, one per line"} value={tier.courses.join("\n")} onChange={(e) => setTier(i, { courses: e.target.value.split("\n") })} onBlur={(e) => setTier(i, { courses: lines(e.target.value) })} />
        <textarea className={styles.input} aria-label="Day by day, one per line" placeholder={"Thu · Arrive · first round\nFri · …"} value={tier.days.map((d) => `${d.day} · ${d.plan}`).join("\n")} onChange={(e) => setTier(i, { days: parseDays(e.target.value) })} />
        <textarea className={styles.input} aria-label="What's included, one per line" placeholder={"What's included, one per line"} value={tier.includes.join("\n")} onChange={(e) => setTier(i, { includes: e.target.value.split("\n") })} onBlur={(e) => setTier(i, { includes: lines(e.target.value) })} />
      </div>)}
      {trip.tiers.length < 3 && <div className={styles.adds}><button type="button" onClick={() => setTrip({ tiers: [...trip.tiers, { id: `tier-${trip.tiers.length}`, label: "", price: "", stay: "", courses: [], days: [], includes: [] }] })}>+ Price level</button></div>}
    </>}

    <div className={styles.preview} aria-live="polite"><span className={styles.label} style={{ color: "#806331" }}>Preview · how it shows on {kind === "trip_plan" ? "Explore" : tab}</span>
      {post ? <RibbonPostCard post={post} /> : trip && <TripPromosPreview trip={trip} />}
      {post && <button type="button" className={styles.button} onClick={() => setFullPreview(true)}>See the full {post.format === "story" ? "article" : "post"}</button>}</div>
    {post && fullPreview && <RibbonArticle post={post} more={[]} onOpen={() => {}} onClose={() => setFullPreview(false)} />}

    {admin && <div className={styles.field}><label className={styles.label} htmlFor="ribbon-when">Schedule for later (optional)</label>
      <input id="ribbon-when" className={styles.input} type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} /></div>}
    {error && <p className={styles.error} role="alert">{error}</p>}

    <div className={styles.buttons}>
      {admin ? <>
        <button type="button" className={styles.primary} onClick={() => save("publish")}>{item?.status === "pending" ? "Approve & publish" : "Publish now"}</button>
        <button type="button" className={styles.button} onClick={() => save("schedule")}>Schedule</button>
        <button type="button" className={styles.button} onClick={() => save("draft")}>Save draft</button>
        {item?.status === "published" && <button type="button" className={styles.button} style={{ gridColumn: "1/-1" }} onClick={() => { ribbon.save(draft, "unpublish"); onClose(); }}>Unpublish</button>}
      </> : <>
        <button type="button" className={styles.primary} onClick={() => save("submit")}>Send for approval</button>
        <button type="button" className={styles.button} style={{ gridColumn: "1/-1" }} onClick={() => save("draft")}>Save draft</button>
      </>}
      {!isNew && (confirmDelete
        ? <div className={styles.confirm}><span>Delete this {kind === "trip_plan" ? "trip plan" : "post"} for good?</span>
            <button type="button" className={styles.button} onClick={() => setConfirmDelete(false)}>Keep</button>
            <button type="button" className={styles.button} onClick={() => { ribbon.remove(draft.id); onClose(); }}>Delete</button></div>
        : <button type="button" className={styles.danger} onClick={() => setConfirmDelete(true)}>{admin ? "Delete" : "Delete draft"}</button>)}
    </div>
  </GolfTripActionSheet>;
}
