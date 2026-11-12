"use client";

import { useEffect, useRef, useState } from "react";
import { Newspaper, X } from "lucide-react";
import { TripFeed } from "./TripFeed";
import { useSimulator } from "@/components/dev/SimulatorBridge";
import { SAMPLE_FEED_POSTS } from "@/lib/dev/sampleFeedPosts";
import styles from "./TripFeedTab.module.css";

/** The trip header Feed action opens the existing full-screen feed. */
export function TripFeedTab({ scope, triggerClassName }: { scope: string; triggerClassName?: string }) {
  const trigger = useRef<HTMLButtonElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  // Dev simulator, Mock golf trip data: made-up posts so the post design can be worked on.
  const simulator = useSimulator();
  const mock = process.env.NODE_ENV === "development" && simulator?.source === "mock";

  // While open: Escape closes it, and the page behind doesn't scroll.
  useEffect(() => {
    if (!open) return;
    close.current?.focus();
    const triggerElement = trigger.current;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    const before = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = before; window.removeEventListener("keydown", onKey); triggerElement?.focus(); };
  }, [open]);

  return <>
    <button ref={trigger} type="button" className={triggerClassName ?? styles.tab} aria-label="Trip feed" aria-expanded={open} aria-controls="trip-feed-sheet" onClick={() => setOpen(true)}><Newspaper size={24} strokeWidth={1.75} aria-hidden /></button>
    {/* Always mounted (so posts stay put when it closes); it grows out of the tab's spot. */}
    <section id="trip-feed-sheet" className={styles.sheet} data-open={open || undefined} aria-label="Feed" aria-hidden={!open} inert={!open}>
      <header className={styles.header}>
        <h2 className={styles.title}>Feed</h2>
        <button ref={close} type="button" className={styles.close} aria-label="Close feed" onClick={() => setOpen(false)}><X size={22} /></button>
      </header>
      {/* The feed itself: a slide-up sheet like Chats, rising once the screen has opened. */}
      <div className={styles.panel}><div className={styles.body}><TripFeed key={`${scope}-${mock}`} initialPosts={mock ? SAMPLE_FEED_POSTS : undefined} /></div></div>
    </section>
  </>;
}
