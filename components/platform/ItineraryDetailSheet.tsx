"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarDays, Clock, FileText, Map as MapIcon, MapPin, Users, X } from "lucide-react";
import { itineraryCategory, itineraryLongDate, itineraryTime, itineraryWeekday, type ItineraryItem } from "@/lib/platform/golfTripItinerary";
import venue from "./GolfTripVenue.module.css";
import styles from "./ItineraryDetailSheet.module.css";

const initials = (text: string) => text.split(/[\s,]+/).filter(Boolean).slice(0, 2).map(word => word[0]?.toUpperCase()).join("") || "—";

/**
 * Info → Itinerary → tap a plan: a sheet that slides up from the bottom, laid out like the Venue tab — a photo card (placeholder)
 * with the plan in a chip, who's going with the day and time, Map and type tiles, then the details. It covers the bottom nav
 * (drawn on the page body, above the nav); X, a tap outside or Escape slides it away in 100 ms and the nav is back.
 */
export function ItineraryDetailSheet({ item, going, onClose }: { item: ItineraryItem; going: string[]; onClose: () => void }) {
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setLeaving(true); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, []);
  const category = itineraryCategory(item);
  // Map opens a Google Maps search for the plan's headline in a new tab.
  const mapHref = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.title)}`;
  return createPortal(<div className={styles.overlay} onClick={() => setLeaving(true)}>
    <div className={`${styles.sheet} ${leaving ? styles.leaving : ""}`} role="dialog" aria-modal="true" aria-label={`${category}: ${item.title}`}
      onClick={event => event.stopPropagation()} onAnimationEnd={() => { if (leaving) onClose(); }}>
      <span className={styles.grabber} aria-hidden />
      <button type="button" className={styles.close} aria-label="Close" onClick={() => setLeaving(true)}><X size={20} strokeWidth={2.25} aria-hidden /></button>
      <h2 className={styles.title}>{item.title}</h2>
      <p className={styles.subtitle}>{category} · {itineraryTime(item.startsAt)}</p>

      <div className={styles.body}>
        <div className={venue.hero} role="img" aria-label={`${item.title} photo placeholder`}>
          <span className={venue.heroChip}><MapPin size={14} aria-hidden /> {item.title}</span>
        </div>

        <div className={venue.venueRow}>
          <div className={venue.venueColumn}>
            <div className={venue.avatars} aria-label={`${going.length} going`}>
              {going.slice(0, 4).map((name, index) => <span key={`${index}-${name}`} className={venue.avatarDot} title={name}>{initials(name)}</span>)}
              {going.length > 4 && <span className={`${venue.avatarDot} ${venue.avatarMore}`}>+{going.length - 4}</span>}
              {!going.length && <span className={venue.tileMuted}>Just you</span>}
            </div>
            <div className={venue.venueTile}>
              <span className={venue.tileLabel}><CalendarDays size={15} aria-hidden /> When</span>
              <strong className={venue.tileValue}>{itineraryWeekday(item.startsAt)}</strong>
              <span className={venue.tileMuted}>{itineraryLongDate(item.startsAt)} · {itineraryTime(item.startsAt)}</span>
            </div>
          </div>
          <div className={venue.venueColumn}>
            <a className={`${venue.venueTile} ${venue.tileButton}`} href={mapHref} target="_blank" rel="noopener noreferrer">
              <span className={venue.tileLabel}><MapIcon size={15} aria-hidden /> Map</span>
            </a>
            <div className={venue.venueTile}>
              <span className={venue.tileLabel}><Clock size={15} aria-hidden /> Type</span>
              <strong className={venue.tileValue}>{category}</strong>
            </div>
          </div>
        </div>

        <div className={venue.categoryGrid}>
          <div className={`${venue.venueTile} ${styles.wide}`}>
            <span className={venue.categoryIcon} aria-hidden><FileText size={18} /></span>
            <span className={venue.categoryText}><strong>Details</strong><span>{item.detail || "No details yet"}</span></span>
          </div>
          <div className={`${venue.venueTile} ${styles.wide}`}>
            <span className={venue.categoryIcon} aria-hidden><Users size={18} /></span>
            <span className={venue.categoryText}><strong>Who&apos;s going</strong><span>{going.length ? going.join(", ") : "Just you"}</span></span>
          </div>
        </div>
      </div>
    </div>
  </div>, document.body);
}
