"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, BedDouble, CalendarDays, Camera, Car, ChevronRight, Flag, LayoutGrid, ListChecks, Map as MapIcon, MapPin, ShoppingBag, Utensils } from "lucide-react";
import type { ItineraryItem } from "@/lib/platform/golfTripItinerary";
import { plannedRounds, tripDates, type GolfTripDraft } from "@/lib/platform/golfTripDraft";
import styles from "./GolfTripVenue.module.css";

const TILE = 256;
const MAP_ZOOM = 9;
const FALLBACK = { latitude: 39.5, longitude: -98.35, zoom: 3 }; // continental US when the trip has no saved location

/** Web-map tile maths: the tile-pixel position of a latitude/longitude at a zoom level. */
function pixelFor(latitude: number, longitude: number, zoom: number) {
  const size = TILE * 2 ** zoom;
  const sin = Math.sin((latitude * Math.PI) / 180);
  return { x: ((longitude + 180) / 360) * size, y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * size };
}

/** OpenStreetMap tiles, softened to a light grey, centred on the venue with a red flag on it. */
function VenueMap({ latitude, longitude }: { latitude?: number; longitude?: number }) {
  const located = latitude !== undefined && longitude !== undefined;
  const zoom = located ? MAP_ZOOM : FALLBACK.zoom;
  const center = pixelFor(located ? latitude : FALLBACK.latitude, located ? longitude : FALLBACK.longitude, zoom);
  const tileX = Math.floor(center.x / TILE), tileY = Math.floor(center.y / TILE), max = 2 ** zoom;
  const tiles = [];
  for (let dy = -2; dy <= 2; dy++) for (let dx = -4; dx <= 4; dx++) {
    const y = tileY + dy;
    if (y < 0 || y >= max) continue;
    const x = (((tileX + dx) % max) + max) % max;
    tiles.push({ key: `${dx},${dy}`, src: `https://tile.openstreetmap.org/${zoom}/${x}/${y}.png`,
      left: (tileX + dx) * TILE - center.x, top: y * TILE - center.y });
  }
  return <div className={styles.map} role="img" aria-label={located ? "Map of the venue" : "Map — venue location not set yet"}>
    {/* Map tiles are plain images on purpose: next/image would re-host every tile. */}
    {/* eslint-disable-next-line @next/next/no-img-element */}
    {tiles.map(tile => <img key={tile.key} src={tile.src} alt="" className={styles.tile} draggable={false}
      style={{ left: `calc(50% + ${tile.left}px)`, top: `calc(50% + ${tile.top}px)` }} />)}
    {located && <Flag className={styles.pin} size={30} strokeWidth={2.25} fill="currentColor" aria-hidden />}
    <span className={styles.attribution}>© OpenStreetMap contributors</span>
  </div>;
}

const initials = (text: string) => text.split(/[\s,]+/).filter(Boolean).slice(0, 2).map(word => word[0]?.toUpperCase()).join("") || "—";
const monthDay = (date: string) => {
  const value = new Date(`${date}T00:00:00Z`);
  return { month: value.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" }), day: value.getUTCDate() };
};

/** Venue tab: map on top, then a sheet with the round and night counts. */
/** Counts my plans by base item (a lodging check-in and check-out are one stay). */
function countKinds(items: ItineraryItem[], kinds: ItineraryItem["kind"][]): number {
  return new Set(items.filter(item => kinds.includes(item.kind)).map(item => item.id.split(":")[0])).size;
}

/**
 * Venue tab: a photo card for the destination, the trip's players with its dates, Map and Itinerary tiles, then category tiles
 * with how many things are in each. The photo is a placeholder for now; Map opens the venue map; Itinerary opens Info → Itinerary.
 */
export function GolfTripVenue({ draft, latitude, longitude, players = [], items = [], onOpenItinerary, today: tripToday }: {
  draft: GolfTripDraft; latitude?: number; longitude?: number; settingsHref?: string;
  players?: string[]; items?: ItineraryItem[]; onOpenItinerary?: () => void;
  /** "YYYY-MM-DD" from the dev trip clock; otherwise the device's date. */
  today?: string;
}) {
  const [mapOpen, setMapOpen] = useState(false);
  const [deviceToday] = useState(() => new Date().toISOString().slice(0, 10));
  const today = tripToday ?? deviceToday;
  const rounds = plannedRounds(draft);
  const dates = tripDates(draft.startDate, draft.endDate);
  const range = dates.length ? `${monthDay(dates[0]).month} ${monthDay(dates[0]).day} – ${monthDay(dates.at(-1)!).month} ${monthDay(dates.at(-1)!).day}, ${dates.at(-1)!.slice(0, 4)}` : "Dates TBD";
  const daysToGo = dates.length ? Math.round((Date.parse(`${dates[0]}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000) : null;
  const countdown = daysToGo === null ? "" : daysToGo > 1 ? `${daysToGo} days to go` : daysToGo === 1 ? "1 day to go" : daysToGo === 0 ? "Starts today" : dates.at(-1)! >= today ? "Happening now" : "Trip over";
  const place = (draft.destination ?? "").split(",")[0]?.trim() || "Destination TBD";
  const categories: { name: string; icon: typeof Flag; count: number }[] = [
    { name: "Golf", icon: Flag, count: rounds.length },
    { name: "Stay", icon: BedDouble, count: countKinds(items, ["lodging"]) },
    { name: "Transport", icon: Car, count: countKinds(items, ["flight", "ride"]) },
    { name: "Eat & Drink", icon: Utensils, count: countKinds(items, ["dining"]) },
    { name: "See & Do", icon: Camera, count: 0 },
    { name: "Shop", icon: ShoppingBag, count: 0 },
    { name: "General", icon: LayoutGrid, count: countKinds(items, ["other"]) },
  ];

  if (mapOpen) return <div className={styles.venue}>
    <VenueMap latitude={latitude} longitude={longitude} />
    <section className={styles.sheet} aria-label="Venue map">
      <span className={styles.grabber} aria-hidden />
      <button type="button" className={styles.mapBack} onClick={() => setMapOpen(false)}><ArrowLeft size={18} aria-hidden /> Back to Venue</button>
    </section>
  </div>;

  return <div className={styles.venueHome}>
    {/* Photo card: placeholder until there's a real destination photo; the destination sits in a chip at the bottom. */}
    <div className={styles.hero} role="img" aria-label={`${place} photo placeholder`}>
      <span className={styles.heroChip}><MapPin size={14} aria-hidden /> {place}</span>
    </div>

    <div className={styles.venueRow}>
      <div className={styles.venueColumn}>
        <div className={styles.avatars} aria-label={`${players.length} players`}>
          {players.slice(0, 4).map((name, index) => <span key={`${index}-${name}`} className={styles.avatarDot} title={name}>{initials(name)}</span>)}
          {players.length > 4 && <span className={`${styles.avatarDot} ${styles.avatarMore}`}>+{players.length - 4}</span>}
          {!players.length && <span className={styles.tileMuted}>No players yet</span>}
        </div>
        <div className={styles.venueTile}>
          <span className={styles.tileLabel}><CalendarDays size={15} aria-hidden /> Dates</span>
          <strong className={styles.tileValue}>{range}</strong>
          {countdown && <span className={styles.tileMuted}>{countdown}</span>}
        </div>
      </div>
      <div className={styles.venueColumn}>
        <button type="button" className={`${styles.venueTile} ${styles.tileButton}`} onClick={() => setMapOpen(true)}>
          <span className={styles.tileLabel}><MapIcon size={15} aria-hidden /> Map</span>
        </button>
        <button type="button" className={`${styles.venueTile} ${styles.tileButton}`} onClick={onOpenItinerary} disabled={!onOpenItinerary}>
          <span className={styles.tileLabel}><ListChecks size={15} aria-hidden /> Itinerary</span>
        </button>
      </div>
    </div>

    {/* Category tiles, two across, with how many things each holds (from the rounds and your plans). */}
    <div className={styles.categoryGrid}>
      {categories.map(({ name, icon: Icon, count }) => <div key={name} className={styles.venueTile}>
        <span className={styles.categoryIcon} aria-hidden><Icon size={18} /></span>
        <span className={styles.categoryText}><strong>{name}</strong><span>{count} {count === 1 ? "item" : "items"}</span></span>
      </div>)}
    </div>
  </div>;
}

/** Home itinerary: the upcoming trip and its planned rounds. */
export function GolfTripItinerary({ draft, settingsHref }: { draft: GolfTripDraft; settingsHref: string }) {
  const rounds = plannedRounds(draft);
  const dates = tripDates(draft.startDate, draft.endDate);
  const range = dates.length ? `${monthDay(dates[0]).month} ${monthDay(dates[0]).day}–${monthDay(dates.at(-1)!).day}, ${dates[0].slice(0, 4)}` : "Dates TBD";
  const year = (dates[0] ?? rounds.find(round => round.date)?.date ?? "").slice(0, 4);

  return <section className={styles.itinerary} aria-label="Trip itinerary">
      <div className={styles.sectionRow}><h3>Upcoming</h3><Link href={settingsHref} className={styles.sectionLink}>Add Round</Link></div>
      <div className={styles.card}>
        <span className={styles.tripIcon} aria-hidden><CalendarDays size={18} /><small>{dates.length || "—"}</small></span>
        <div className={styles.cardText}><strong>{dates.length ? `${dates.length}-Day Trip` : "Trip"}</strong><span>{draft.destination || "Destination TBD"} · {range}</span></div>
        <ChevronRight className={styles.chevron} size={18} aria-hidden />
      </div>

      <div className={styles.sectionRow}><h3>{year ? `${year} Rounds` : "Rounds"}</h3></div>
      {rounds.length ? <div className={styles.list}>
        {rounds.map(round => {
          const when = round.date ? monthDay(round.date) : null;
          return <div key={round.number} className={styles.card}>
            <span className={styles.dateBlock}><small>{when?.month ?? "Day"}</small><strong>{when?.day ?? round.dayNumber}</strong></span>
            <div className={styles.cardText}><strong>{draft[`round${round.number}Course`] || "Course TBD"}</strong><span>Round {round.number} · Day {round.dayNumber}</span></div>
            <span className={styles.thumb} aria-hidden><Flag size={18} /></span>
            <ChevronRight className={styles.chevron} size={18} aria-hidden />
          </div>;
        })}
      </div> : <p className={styles.empty}>No rounds planned yet.</p>}
  </section>;
}
