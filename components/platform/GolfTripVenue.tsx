"use client";

import Link from "next/link";
import { BedDouble, CalendarDays, ChevronRight, Flag, Plus, Search } from "lucide-react";
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
export function GolfTripVenue({ draft, latitude, longitude, settingsHref }: {
  draft: GolfTripDraft; latitude?: number; longitude?: number; settingsHref: string;
}) {
  const rounds = plannedRounds(draft);
  const dates = tripDates(draft.startDate, draft.endDate);
  const nights = Math.max(0, dates.length - 1);


  return <div className={styles.venue}>
    <VenueMap latitude={latitude} longitude={longitude} />
    <section className={styles.sheet} aria-label="Venue">
      <span className={styles.grabber} aria-hidden />
      <div className={styles.titleRow}>
        <h2 className={styles.title}>Venue</h2>
        <div className={styles.titleActions}>
          <button type="button" className={styles.roundButton} aria-label="Search the venue"><Search size={20} aria-hidden /></button>
          <Link href={settingsHref} className={styles.roundButton} aria-label="Add to the trip"><Plus size={22} aria-hidden /></Link>
        </div>
      </div>

      <div className={styles.statsCard}>
        <span className={styles.avatar} aria-hidden>{initials(draft.destination ?? "")}</span>
        <div className={styles.stat}><strong>{rounds.length}</strong><span><Flag size={12} aria-hidden />rounds</span></div>
        <div className={styles.stat}><strong>{nights}</strong><span><BedDouble size={12} aria-hidden />nights</span></div>
        <ChevronRight className={styles.chevron} size={18} aria-hidden />
      </div>


    </section>
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
