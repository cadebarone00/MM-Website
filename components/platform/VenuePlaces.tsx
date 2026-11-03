"use client";

import { useState, useSyncExternalStore } from "react";
import { Beer, Check, Coffee, Flag, Heart, MapPin, Navigation, Plus, Search, Ticket, Utensils, type LucideIcon } from "lucide-react";
import { useSimulator } from "@/components/dev/SimulatorBridge";
import { distanceLabel, distanceMiles, isAppleDevice, mapsLink, PLACE_CATEGORIES, placeBadge, rankPlaces, type Place, type PlaceCategory } from "@/lib/platform/venuePlaces";
import { SAMPLE_CENTER, samplePlaces } from "@/lib/dev/samplePlaces";
import { PLACES_CREDIT } from "@/lib/platform/placeAreas";
import styles from "./VenuePlaces.module.css";

const ICONS: Record<PlaceCategory, LucideIcon> = { food: Utensils, bars: Beer, golf: Flag, coffee: Coffee, todo: Ticket };
export type VenueStage = "list" | "loading" | "category" | "saved" | "empty" | "no-destination";

const subscribe = () => () => {};
/** Apple Maps on Apple devices, Google Maps elsewhere (decided on the device; the server renders Google). */
const useApple = () => useSyncExternalStore(subscribe, () => isAppleDevice(navigator.userAgent), () => false);

/**
 * Golf Trip → Venue (phase 1 design, project_specs.md "Venue tab → Places recommendations"): the trip's destination in a
 * search pill, "What are you looking for?" category circles, then place cards — picture (category artwork until real
 * photos), heart, name, address, distance, a detail line, our badge, Add to itinerary and Open in Maps. DEV PREVIEW ONLY
 * for now: the places are samples (lib/dev/samplePlaces.ts); the simulator's Venue conditionals pick the state.
 */
export function VenuePlaces({ destination, center }: { destination: string; center?: { latitude: number; longitude: number } }) {
  const stage: VenueStage = useSimulator()?.state.venueStage ?? "list";
  return <VenueStageView key={stage} stage={stage} destination={destination} center={center ?? SAMPLE_CENTER} />;
}

function VenueStageView({ stage, destination, center }: { stage: VenueStage; destination: string; center: { latitude: number; longitude: number } }) {
  const apple = useApple();
  const [category, setCategory] = useState<PlaceCategory | null>(stage === "category" ? "bars" : null);
  const [saved, setSaved] = useState<string[]>(stage === "saved" ? ["sample-4"] : []);
  const [added, setAdded] = useState<string[]>(stage === "saved" ? ["sample-4"] : []);
  const [query, setQuery] = useState("");
  const place = destination.split(",").slice(0, 2).join(",").trim() || "Destination TBD";

  if (stage === "no-destination") return <section className={styles.venue} aria-label="Places">
    <div className={styles.message}>
      <MapPin size={28} aria-hidden />
      <strong>No destination yet</strong>
      <span>Once the organizer sets where the trip is, places to eat, drink and play show up here.</span>
    </div>
  </section>;

  const all = stage === "empty" ? [] : rankPlaces(samplePlaces(center, saved), center);
  const term = query.trim().toLowerCase();
  const shown = all.filter((p) => (!category || p.category === category) && (!term || `${p.name} ${p.detail ?? ""}`.toLowerCase().includes(term)));
  const toggle = (list: string[], id: string) => list.includes(id) ? list.filter((x) => x !== id) : [...list, id];

  return <section className={styles.venue} aria-label="Places">
    <label className={styles.search}>
      <Search size={18} aria-hidden />
      <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search places in ${place}`} aria-label={`Search places in ${place}`} />
      <span className={styles.searchPlace}><MapPin size={13} aria-hidden />{place.split(",")[0]}</span>
    </label>

    <h2 className={styles.heading}>What are you looking for?</h2>
    <div className={styles.categories} role="group" aria-label="Categories">
      {PLACE_CATEGORIES.map(({ key, label }) => {
        const Icon = ICONS[key];
        return <button key={key} type="button" className={styles.category} aria-pressed={category === key} onClick={() => setCategory(category === key ? null : key)}>
          <span className={styles.categoryCircle}><Icon size={26} strokeWidth={1.8} aria-hidden /></span>
          <span className={styles.categoryLabel}>{label}</span>
        </button>;
      })}
    </div>

    {stage === "loading"
      ? <div className={styles.list} aria-busy="true" aria-label="Loading places">{[0, 1].map((i) => <div key={i} className={`${styles.card} ${styles.skeleton}`}><div className={styles.picture} /><div className={styles.cardBody}><span /><span /><span /></div></div>)}</div>
      : shown.length === 0
        ? <div className={styles.message}><Search size={26} aria-hidden /><strong>No places found</strong><span>{term ? "Try another name." : "Nothing in this category near the trip yet. Organizers can add one."}</span></div>
        : <div className={styles.list}>
          {shown.map((p) => {
            const Icon = ICONS[p.category];
            const isSaved = saved.includes(p.id), isAdded = added.includes(p.id);
            const badge = placeBadge({ ...p, savedByGroup: isSaved || p.savedByGroup });
            return <article key={p.id} className={styles.card}>
              <div className={`${styles.picture} ${styles[`art_${p.category}`]}`}>
                <Icon className={styles.pictureIcon} size={44} strokeWidth={1.4} aria-hidden />
                <span className={styles.distance}>{distanceLabel(distanceMiles(center, p))}</span>
                <button type="button" className={styles.heart} aria-pressed={isSaved} aria-label={isSaved ? `Unsave ${p.name}` : `Save ${p.name}`} onClick={() => setSaved(toggle(saved, p.id))}>
                  <Heart size={18} fill={isSaved ? "currentColor" : "none"} aria-hidden />
                </button>
              </div>
              <div className={styles.cardBody}>
                <h3 className={styles.name}>{p.name}</h3>
                {p.address && <p className={styles.line}><MapPin size={13} aria-hidden />{p.address}</p>}
                {p.detail && <p className={styles.line}>{p.detail}</p>}
                {badge && <p className={styles.badge}>{badge}</p>}
                <div className={styles.actions}>
                  <button type="button" className={styles.add} aria-pressed={isAdded} onClick={() => setAdded(toggle(added, p.id))}>
                    {isAdded ? <><Check size={16} aria-hidden /> Added</> : <><Plus size={16} aria-hidden /> Add to itinerary</>}
                  </button>
                  <a className={styles.maps} href={mapsLink(p, apple)} target="_blank" rel="noopener noreferrer">
                    <Navigation size={15} aria-hidden /> Open in Maps
                  </a>
                </div>
              </div>
            </article>;
          })}
        </div>}
    <p className={styles.credit}>{PLACES_CREDIT}</p>
  </section>;
}
