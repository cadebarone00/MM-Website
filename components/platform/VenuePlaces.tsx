"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { Beer, Check, Coffee, Flag, Heart, MapPin, Navigation, Plus, Search, SlidersHorizontal, X, Star, Ticket, Utensils, type LucideIcon } from "lucide-react";
import { useSimulator } from "@/components/dev/SimulatorBridge";
import { distanceLabel, distanceMiles, isAppleDevice, mapsLink, PLACE_CATEGORIES, placeBadge, rankPlaces, type Place, type PlaceCategory } from "@/lib/platform/venuePlaces";
import { SAMPLE_CENTER, samplePlaces } from "@/lib/dev/samplePlaces";
import { PLACES_CREDIT } from "@/lib/platform/placeAreas";
import styles from "./VenuePlaces.module.css";

const ICONS: Record<PlaceCategory, LucideIcon> = { food: Utensils, bars: Beer, golf: Flag, coffee: Coffee, todo: Ticket };
export type VenueStage = "list" | "loading" | "category" | "saved" | "empty" | "no-destination";
type Center = { latitude: number; longitude: number };
/** Add to itinerary: the parent opens the plan form for this place and calls `done()` once it's saved. */
export type AddToItinerary = (place: Place, done: () => void) => void;

const subscribe = () => () => {};
const DEFAULT_FILTERS = { location: "", miles: "", minimum: "", savedOnly: false, sort: "recommended" };
/** Apple Maps on Apple devices, Google Maps elsewhere (decided on the device; the server renders Google). */
const useApple = () => useSyncExternalStore(subscribe, () => isAppleDevice(navigator.userAgent), () => false);

/**
 * Golf Trip → Venue: place recommendations (project_specs.md "Venue tab → Places recommendations"). The trip's destination
 * in a search pill, category circles, then place cards — picture (category artwork), heart,
 * name, address, distance, a detail line, our badge, Add to itinerary and Open in Maps.
 *   * `tripId` (a real trip, members): places from our database (GET /api/golf-trips/<id>/places, filled daily from Overture
 *     Maps); the heart saves for the group and Add to itinerary opens the plan form (`onAddToItinerary`).
 *   * no `tripId` (dev simulator, the app tour): sample places; the simulator's Venue conditionals pick the state.
 */
export function VenuePlaces({ destination, center, tripId, onAddToItinerary }: { destination: string; center?: Center; tripId?: string; onAddToItinerary?: AddToItinerary }) {
  const stage: VenueStage = useSimulator()?.state.venueStage ?? "list";
  if (tripId) return <LiveVenue tripId={tripId} destination={destination} center={center} onAddToItinerary={onAddToItinerary} />;
  return <SampleVenue key={stage} stage={stage} destination={destination} center={center ?? SAMPLE_CENTER} />;
}

function SampleVenue({ stage, destination, center }: { stage: VenueStage; destination: string; center: Center }) {
  const [saved, setSaved] = useState<string[]>(stage === "saved" ? ["sample-4"] : []);
  const [added, setAdded] = useState<string[]>(stage === "saved" ? ["sample-4"] : []);
  if (stage === "no-destination") return <NoDestination />;
  return <PlacesView destination={destination} center={center} loading={stage === "loading"} initialCategory={stage === "category" ? "bars" : null}
    places={stage === "empty" ? [] : samplePlaces(center, saved)} saved={saved} added={added}
    onSave={(place) => setSaved((list) => toggle(list, place.id))} onAdd={(place) => setAdded((list) => toggle(list, place.id))} />;
}

type Live = { status: "loading" } | { status: "no-destination" } | { status: "off" } | { status: "error" }
  | { status: "ok"; places: (Place & { savedByMe?: boolean })[]; pending: PlaceCategory[] };

function LiveVenue({ tripId, destination, center, onAddToItinerary }: { tripId: string; destination: string; center?: Center; onAddToItinerary?: AddToItinerary }) {
  const [live, setLive] = useState<Live>({ status: "loading" });
  const [saved, setSaved] = useState<string[]>([]);
  const [added, setAdded] = useState<string[]>([]);
  useEffect(() => {
    let current = true;
    (async () => {
      try {
        const response = await fetch(`/api/golf-trips/${tripId}/places`, { cache: "no-store" });
        const body = await response.json().catch(() => null);
        if (!current) return;
        if (response.status === 503) return setLive({ status: "off" });
        if (!response.ok || !body) return setLive({ status: "error" });
        if (body.status === "no-destination") return setLive({ status: "no-destination" });
        setLive({ status: "ok", places: body.places ?? [], pending: body.pending ?? [] });
        setSaved((body.places ?? []).filter((p: { savedByMe?: boolean }) => p.savedByMe).map((p: Place) => p.id));
      } catch { if (current) setLive({ status: "error" }); }
    })();
    return () => { current = false; };
  }, [tripId]);

  // The heart answers at once and saves in the background; if saving fails it flips back.
  const save = (place: Place) => {
    const on = !saved.includes(place.id);
    setSaved((list) => toggle(list, place.id));
    fetch(`/api/golf-trips/${tripId}/places/${place.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ saved: on }) })
      .then((response) => { if (!response.ok) throw new Error(); })
      .catch(() => setSaved((list) => on ? list.filter((id) => id !== place.id) : [...list, place.id]));
  };
  const add = (place: Place) => onAddToItinerary?.(place, () => {
    setAdded((list) => list.includes(place.id) ? list : [...list, place.id]);
    fetch(`/api/golf-trips/${tripId}/places/${place.id}`, { method: "POST" }).catch(() => undefined); // only counts "Added by N trips"
  });

  if (live.status === "no-destination") return <NoDestination />;
  if (live.status === "off" || live.status === "error") return <section className={styles.venue} aria-label="Places">
    <Message icon={<MapPin size={28} aria-hidden />} title={live.status === "off" ? "Places are coming soon" : "Couldn't load places"}
      text={live.status === "off" ? "Recommended spots for this trip will show up here." : "Check your connection and open Venue again."} />
  </section>;
  const places = live.status === "ok" ? live.places : [];
  const everythingPending = live.status === "ok" && places.length === 0 && live.pending.length === PLACE_CATEGORIES.length;
  return <PlacesView destination={destination} center={center ?? centerOf(places)} loading={live.status === "loading"} places={places}
    saved={saved} added={added} onSave={save} onAdd={onAddToItinerary ? add : undefined}
    empty={everythingPending ? { title: "Finding places", text: "We're gathering spots near your trip. They'll be here within a day." } : undefined} />;
}

/** The shared screen: search, categories, then the cards (or a loading / empty state at the same place). */
function PlacesView({ destination, center, loading, places, saved, added, onSave, onAdd, initialCategory = null, empty }: {
  destination: string; center: Center; loading: boolean; places: Place[]; saved: string[]; added: string[];
  onSave: (place: Place) => void; onAdd?: (place: Place) => void; initialCategory?: PlaceCategory | null; empty?: { title: string; text: string };
}) {
  const apple = useApple();
  const [category, setCategory] = useState<PlaceCategory | null>(initialCategory);
  const [query, setQuery] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [draft, setDraft] = useState(DEFAULT_FILTERS);
  const [draftCategory, setDraftCategory] = useState<PlaceCategory | null>(initialCategory);
  const origin = places.find((p) => p.id === filters.location) ?? center;
  const active = category !== null || Object.entries(filters).some(([key, value]) => value !== DEFAULT_FILTERS[key as keyof typeof DEFAULT_FILTERS]);
  const place = destination.split(",").slice(0, 2).join(",").trim() || "Destination TBD";
  const term = query.trim().toLowerCase();
  const ranked = rankPlaces(places.map((p) => ({ ...p, savedByGroup: p.savedByGroup || saved.includes(p.id) })), origin);
  const shown = ranked.filter((p) => (!category || p.category === category)
    && (!term || `${p.name} ${p.detail ?? ""}`.toLowerCase().includes(term))
    && (!filters.miles || distanceMiles(origin, p) <= Number(filters.miles))
    && (!filters.minimum || ((p.ratingCount ?? 0) > 0 && (p.ratingAverage ?? 0) / 2 >= Number(filters.minimum)))
    && (!filters.savedOnly || p.savedByGroup));
  if (filters.sort === "nearest") shown.sort((a, b) => distanceMiles(origin, a) - distanceMiles(origin, b));
  if (filters.sort === "rating") shown.sort((a, b) => ((b.ratingCount ?? 0) > 0 ? b.ratingAverage ?? 0 : -1) - ((a.ratingCount ?? 0) > 0 ? a.ratingAverage ?? 0 : -1));

  return <section className={styles.venue} aria-label="Places">
    <div className={styles.searchRow}>
    <label className={styles.search}>
      <Search size={18} aria-hidden />
      <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search places in ${place}`} aria-label={`Search places in ${place}`} />
      <span className={styles.searchPlace}><MapPin size={13} aria-hidden />{place.split(",")[0]}</span>
    </label>
    <button type="button" className={styles.filterButton} aria-label="Filter places" aria-haspopup="dialog" data-active={active} onClick={() => { setDraft({ ...filters }); setDraftCategory(category); dialog.current?.showModal(); }}><SlidersHorizontal size={19} aria-hidden /></button>
    </div>
    <dialog ref={dialog} className={styles.filterSheet} aria-labelledby="venue-filter-title" onClick={(event) => { if (event.target === event.currentTarget) dialog.current?.close(); }}>
      <form className={styles.filterForm} onSubmit={(event) => { event.preventDefault(); setFilters({ ...draft }); setCategory(draftCategory); dialog.current?.close(); }}>
        <div className={styles.filterHeader}><h2 id="venue-filter-title">Filters</h2><button type="button" aria-label="Close filters" onClick={() => dialog.current?.close()}><X size={22} aria-hidden /></button></div>
        <label>Location<select value={draft.location} onChange={(e) => setDraft({ ...draft, location: e.target.value })}><option value="">Trip area · {place}</option>{places.map((p) => <option value={p.id} key={p.id}>Near {p.name}</option>)}</select></label>
        <label>Within miles<input type="number" min="0.1" step="any" placeholder="Any distance" value={draft.miles} onChange={(e) => setDraft({ ...draft, miles: e.target.value })} /></label>
        <p className={styles.filterHelp}>Straight-line distance from your selected location, using places available for this trip.</p>
        <label>Category<select value={draftCategory ?? ""} onChange={(e) => setDraftCategory((e.target.value || null) as PlaceCategory | null)}><option value="">All categories</option>{PLACE_CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}</select></label>
        <label>Minimum Maroon Rating<select value={draft.minimum} onChange={(e) => setDraft({ ...draft, minimum: e.target.value })}><option value="">Any rating</option>{[3, 3.5, 4, 4.5].map((n) => <option key={n} value={n}>{n.toFixed(1)} stars & up</option>)}</select></label>
        <label className={styles.filterCheck}><input type="checkbox" checked={draft.savedOnly} onChange={(e) => setDraft({ ...draft, savedOnly: e.target.checked })} />Saved by our group</label>
        <label>Sort by<select value={draft.sort} onChange={(e) => setDraft({ ...draft, sort: e.target.value })}><option value="recommended">Recommended</option><option value="nearest">Nearest</option><option value="rating">Highest Maroon Rating</option></select></label>
        <div className={styles.filterActions}><button type="button" className={styles.maps} onClick={() => { setDraft({ ...DEFAULT_FILTERS }); setDraftCategory(null); }}>Reset</button><button type="submit" className={styles.add}>Apply filters</button></div>
      </form>
    </dialog>

    <div className={styles.categories} role="group" aria-label="Categories">
      {PLACE_CATEGORIES.map(({ key, label }) => {
        const Icon = ICONS[key];
        return <button key={key} type="button" className={styles.category} aria-pressed={category === key} onClick={() => setCategory(category === key ? null : key)}>
          <span className={styles.categoryCircle}><Icon size={22} strokeWidth={1.8} aria-hidden /></span>
          <span className={styles.categoryLabel}>{label}</span>
        </button>;
      })}
    </div>

    {loading
      ? <div className={styles.list} aria-busy="true" aria-label="Loading places">{[0, 1].map((i) => <div key={i} className={`${styles.card} ${styles.skeleton}`}><div className={styles.picture} /><div className={styles.cardBody}><span /><span /><span /></div></div>)}</div>
      : shown.length === 0
        ? empty && !term && !active ? <Message icon={<Search size={26} aria-hidden />} title={empty.title} text={empty.text} />
          : <Message icon={<Search size={26} aria-hidden />} title="No places found" text={active ? "Try a wider distance or reset your filters." : "Try another name."} />
        : <div className={styles.list}>
          {shown.map((p) => {
            const Icon = ICONS[p.category];
            const isSaved = saved.includes(p.id), isAdded = added.includes(p.id);
            const badge = placeBadge(p);
            const visibleBadge = badge === "Ranked highly by Maroon users" ? null : badge;
            const rating = (p.ratingCount ?? 0) > 0 && Number.isFinite(p.ratingAverage) ? Math.round(Math.max(0, Math.min(5, p.ratingAverage! / 2)) * 10) / 10 : null;
            return <article key={p.id} className={styles.card}>
              <div className={`${styles.picture} ${styles[`art_${p.category}`]}`}>
                <Icon className={styles.pictureIcon} size={44} strokeWidth={1.4} aria-hidden />
                <span className={styles.distance}>{distanceLabel(distanceMiles(origin, p))}</span>
                <button type="button" className={styles.heart} aria-pressed={isSaved} aria-label={isSaved ? `Unsave ${p.name}` : `Save ${p.name}`} onClick={() => onSave(p)}>
                  <Heart size={18} fill={isSaved ? "currentColor" : "none"} aria-hidden />
                </button>
              </div>
              <div className={styles.cardBody}>
                <div className={styles.cardDetails}>
                <div className={styles.placeInfo}>
                <h3 className={styles.name}>{p.name}</h3>
                {p.address && <p className={styles.line}><MapPin size={13} aria-hidden />{p.address}</p>}
                {p.detail && <p className={styles.line}>{p.detail}</p>}
                {visibleBadge && <p className={styles.badge}>{visibleBadge}</p>}
                </div>
                <div className={styles.rating} aria-label={rating === null ? "Maroon Rating: not yet rated" : `Maroon Rating: ${rating.toFixed(1)} out of 5 stars`}>
                  <span className={styles.ratingLabel}>Maroon Rating</span>
                  <span className={styles.stars} aria-hidden="true">{[0, 1, 2, 3, 4].map((index) => <span className={styles.star} key={index}>
                    <Star size={15} className={styles.starEmpty} />
                    <span className={styles.starFill} style={{ width: `${Math.max(0, Math.min(1, (rating ?? 0) - index)) * 100}%` }}><Star size={15} fill="currentColor" /></span>
                  </span>)}</span>
                  <span className={styles.ratingValue} aria-hidden="true">{rating === null ? "?" : rating.toFixed(1)}</span>
                </div>
                </div>
                <div className={`${styles.actions} ${onAdd ? "" : styles.actionsOne}`}>
                  {onAdd && <button type="button" className={styles.add} aria-pressed={isAdded} onClick={() => onAdd(p)}>
                    {isAdded ? <><Check size={16} aria-hidden /> Added</> : <><Plus size={16} aria-hidden /> Add to itinerary</>}
                  </button>}
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

function NoDestination() {
  return <section className={styles.venue} aria-label="Places">
    <Message icon={<MapPin size={28} aria-hidden />} title="No destination yet" text="Once the organizer sets where the trip is, places to eat, drink and play show up here." />
  </section>;
}
function Message({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return <div className={styles.message}>{icon}<strong>{title}</strong><span>{text}</span></div>;
}
const toggle = (list: string[], id: string) => list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
/** Without the trip's own spot, measure distances from the middle of its places. */
function centerOf(places: Place[]): Center {
  if (!places.length) return SAMPLE_CENTER;
  return { latitude: places.reduce((s, p) => s + p.latitude, 0) / places.length, longitude: places.reduce((s, p) => s + p.longitude, 0) / places.length };
}
