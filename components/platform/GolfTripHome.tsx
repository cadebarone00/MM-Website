"use client";

import { Suspense, use, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ComponentProps, type ReactNode } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { AlertTriangle, ArrowLeft, BedDouble, Bell, CalendarDays, Camera, Car, ChevronLeft, ChevronRight, Clock, Cloud, CloudFog, CloudLightning, CloudRain, CloudSnow, CloudSun, Droplets, ExternalLink, FileText, Flag, LockKeyhole, MapPin, MessageCircle, Plane, Plus, Settings, Share2, ShieldCheck, ShoppingBag, Sun, Thermometer, Trash2, Trophy, User, Users, Wind, X, type LucideIcon } from "lucide-react";
import { golfTripDraftSnapshot, parseGolfTripDraft, type GolfTripDraft, plannedRounds, shortTripDate, tripDates } from "@/lib/platform/golfTripDraft";
import { normalizeCompetitor, type GolfMatchPreview } from "@/lib/platform/golfTripPreviewFixture";
import { ITINERARY_KIND_LABEL, itineraryByDay, itineraryCategory, itineraryDay, itineraryLongDate, itineraryTime, itineraryWeekday, liveAndUpcoming, localNow, type ItineraryItem, type ItineraryKind } from "@/lib/platform/golfTripItinerary";
import { addMyItem, itineraryFor, removeMyItem, updateMyItem, type TripTravel } from "@/lib/platform/tripTravel";
import { GolfTripMyTravel, type MyTravelChange } from "./GolfTripMyTravel";
import { TravelKindIcon } from "./travelKinds";
import type { TripWeather } from "@/lib/platform/weather/types";
import { flightCounts, flightTime, type FlightSummary } from "@/lib/platform/golfTripFlights";

/** The Info tab's Flights card: the viewer's flight summary, and the Flights page it opens (null = not a link). */
export interface TripFlights { summary: FlightSummary; href: string | null }
import { GolfGamesSummary, GolfMatchup, GolfTournamentSummary, GolfTripLeaderboard } from "./GolfTripMatch";
import { GolfTripScoring } from "./GolfTripScoring";
import { GolfTripCompetitionMatchPreview } from "./GolfTripCompetitionMatchPreview";
import { GolfTripActionSheet } from "./GolfTripActionSheet";
import { GolfTripGames } from "./GolfTripGames";
import { GolfTripChat } from "./GolfTripChat";
import { GolfTripItinerary, GolfTripVenue } from "./GolfTripVenue";
import { ItineraryDetailSheet } from "./ItineraryDetailSheet";
import { shortPlace } from "@/lib/platform/placeLabel";
import { GolfTripNotifications } from "./GolfTripNotifications";
import { getPlayerDisplayName } from "@/lib/data/players";
import styles from "./GolfTripHome.module.css";

import { GOLF_TRIP_TABS as TABS, GOLF_TRIP_SECTIONS as GOLF_SLIDES, type GolfTripNavigation } from "@/lib/platform/golfTripNavigation";
type Tab = (typeof TABS)[number];

const TOURNAMENT_ANSWERS: Record<string, string> = { yes: "Yes, there's a tournament", no: "No tournament, just golf", undecided: "Not sure yet" };

/** The draft only changes on the questionnaire's Next, so there is nothing to listen for here. */
const subscribeNever = () => () => {};

/**
 * Golf Trip Home: trip name, a 4-tab selector, and (on Home) one card per part of the trip. Layout only:
 * cards show the questionnaire answers kept in this tab, or an empty state. Nothing is saved yet.
 * `preview` replaces those answers with fixed ones (the /dev/tournament design preview).
 * `settingsHref` is where the settings wheel goes (this trip's settings page).
 * `backHref` adds a small "← Golf Trips" link on desktop, where the bottom tabs (and their Golf Trips tab) are hidden.
 * `previewMatch` fills the Golf tab's Overview leaderboard with made-up data (/dev/tournament only); without it they are "Coming soon".
 * `weather` (saved trips only, still loading on the server) adds a Weather card after Travel that shows a loading line
 * until it settles, so the rest of the page never waits for it; without it there is no Weather card.
 * `flights` fills the Info tab's Flights card with the viewer's own flights; `href` (saved trips) makes it open the Flights page.
 * `roundLive` shows the Scoring sheet: only while a round is being played (or finished but not yet submitted). Before the
 * first round, between rounds and after the trip there is nothing to score. Saved trips have no round data yet, so no sheet.
 * `navigation` optionally requests a shared tab/section; in-app navigation remains local between requests.
 * `onNavigationChange` optionally observes the actual tab/section; the dev wrapper supplies it only when embedded.
 */
export function GolfTripHome({ preview, settingsHref, backHref, previewMatch, weather, flights, travel: travelSeed, navigation, onNavigationChange, roundLive = false, opponentCardMatches, scoringPrefill, onScoringSubmit, submittedCard, scoringOwner }:
  { preview?: GolfTripDraft; settingsHref: string; backHref?: string; previewMatch?: GolfMatchPreview; weather?: Promise<TripWeather>; flights?: TripFlights;
    /** Everyone's travel (My Info, the Itinerary and the Home "what's next" cards). Only the dev mock trip has it for now. */
    travel?: TripTravel; navigation?: GolfTripNavigation; onNavigationChange?: (navigation: GolfTripNavigation) => void; roundLive?: boolean;
    /** Dev preview only: whether the opponent's own scorecard agrees with mine (there is no second scorer yet). Without it, Save & Submit never shows. */
    opponentCardMatches?: boolean;
    /** Dev preview only: a finished-but-unsubmitted Scoring card (the "End of round" conditionals). */
    scoringPrefill?: ComponentProps<typeof GolfTripScoring>["prefill"];
    /** Player rounds: Submit & Save hands over the card; a round already saved for this player reopens locked. */
    onScoringSubmit?: ComponentProps<typeof GolfTripScoring>["onSubmit"]; submittedCard?: ComponentProps<typeof GolfTripScoring>["submittedCard"];
    /** Whose card this is (dev: the signed-in mock account). A different person gets a fresh Scoring sheet. */
    scoringOwner?: string }) {
  const raw = useSyncExternalStore(subscribeNever, golfTripDraftSnapshot, () => "");
  const stored = useMemo(() => parseGolfTripDraft(raw), [raw]);
  const draft = preview ?? stored;
  const [selection, setSelection] = useState<{ navigation?: GolfTripNavigation; tab: Tab }>({ navigation, tab: navigation?.tab ?? "Home" });
  // A new external navigation request selects a tab; ordinary renders keep in-app navigation.
  if (selection.navigation !== navigation) setSelection({ navigation, tab: navigation?.tab ?? selection.tab });
  const tab = selection.navigation === navigation ? selection.tab : navigation?.tab ?? selection.tab;
  const setTab = (tab: Tab) => setSelection({ navigation, tab });
  // Info tab: 0 = My Info, 1 = Itinerary. A Home itinerary card opens Info on Itinerary.
  const [infoSlide, setInfoSlide] = useState(0);
  const openItinerary = () => { setInfoSlide(1); setTab("Info"); };
  // Trip travel lives in page state for now (dev mock trip): edits in My Info rebuild the itinerary and Home cards right
  // away, and reset on reload. A different seed (e.g. the simulator switching data) starts fresh.
  const [travelState, setTravelState] = useState({ seed: travelSeed, travel: travelSeed });
  if (travelState.seed !== travelSeed) setTravelState({ seed: travelSeed, travel: travelSeed });
  const travel = travelState.travel;
  const itinerary = travel ? itineraryFor(travel) : undefined;
  const changeMyTravel = (change: MyTravelChange) => setTravelState((current) => {
    if (!current.travel) return current;
    const next = change.type === "add" ? addMyItem(current.travel, change.item)
      : change.type === "update" ? updateMyItem(current.travel, change.id, change.changes)
      : removeMyItem(current.travel, change.id);
    return { ...current, travel: next };
  });
  useEffect(() => {
    if (tab !== "Golf") onNavigationChange?.({ tab });
  }, [tab, onNavigationChange]);
  const competitive = draft.includesTournament === "yes";
  const [chatOpen, setChatOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const notificationsRef = useRef<HTMLDivElement>(null);
  const notificationButtonRef = useRef<HTMLButtonElement>(null);
  const notificationCloseRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!notificationsOpen) return;
    notificationCloseRef.current?.focus();
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !notificationsRef.current?.contains(event.target) && !notificationButtonRef.current?.contains(event.target)) setNotificationsOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setNotificationsOpen(false);
        notificationButtonRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", escape);
    };
  }, [notificationsOpen]);


  const dates = tripDates(draft.startDate, draft.endDate);
  const dateRange = dates.length > 0 ? `${shortTripDate(dates[0])} – ${shortTripDate(dates[dates.length - 1])}` : "";

  // Scoring starts from the preview's featured golfer (the organizer) so the sheet has a round in progress to show.
  const firstCompetitor = previewMatch?.matches[0]?.left ? normalizeCompetitor(previewMatch.matches[0].left) : undefined;
  const you = firstCompetitor?.golfers[0]?.name;
  const yourHoles = previewMatch?.leaderboard.find((row) => row.golfer.name === you)?.holes;

  return <main className={`${styles.page} ${roundLive ? styles.pageWithScoring : ""} ${tab === "Golf" && preview && previewMatch ? styles.pageGolfPreview : ""}`}>
    {backHref && <Link href={backHref} className={styles.desktopBack}><ArrowLeft size={16} strokeWidth={2} aria-hidden />Golf Trips</Link>}
    <header className={styles.header}>
      <div className={styles.headerActions}>
        <button type="button" className={styles.iconButton} aria-label="Trip chat" onClick={() => setChatOpen(true)}><MessageCircle size={24} strokeWidth={1.75} aria-hidden /></button>
        <div className={styles.notificationsAnchor}>
          <button ref={notificationButtonRef} type="button" className={styles.iconButton} aria-label="Notifications" aria-expanded={notificationsOpen} aria-controls="trip-notifications" onClick={() => setNotificationsOpen(open => !open)}><Bell size={24} strokeWidth={1.75} aria-hidden /></button>
          {notificationsOpen && createPortal(<div ref={notificationsRef} onBlur={event => {
            if (!event.currentTarget.contains(event.relatedTarget) && event.relatedTarget !== notificationButtonRef.current) setNotificationsOpen(false);
          }} id="trip-notifications" role="region" aria-label="Notifications" className={`${styles.addSheet} ${styles.notificationsDropdown}`}>
            <button ref={notificationCloseRef} type="button" className={styles.sheetClose} aria-label="Close notifications" onClick={() => { setNotificationsOpen(false); notificationButtonRef.current?.focus(); }}><X size={18} strokeWidth={2.25} aria-hidden /></button>
            <GolfTripNotifications />
          </div>, document.body)}
        </div>
        <Link href={settingsHref} className={styles.iconButton} aria-label="Trip settings"><Settings size={24} strokeWidth={1.75} aria-hidden /></Link>
      </div>
      <h1 className={styles.title}>{draft.tripName || "Your Golf Trip"}</h1>
      <div className={`${styles.tabs} ${styles.tripTabs}`} role="tablist" aria-label="Trip sections">
        {TABS.map((name) => <button key={name} type="button" role="tab" aria-selected={tab === name}
          className={`${styles.tab} ${tab === name ? styles.tabActive : ""}`} onClick={() => setTab(name)}>{name}</button>)}
      </div>
    </header>
    <div className={styles.body} role="tabpanel" aria-label={tab}>
      {tab === "Home" ? <InfoAccount draft={draft} settingsHref={settingsHref} flights={flights} weather={weather} itinerary={itinerary} onOpenItinerary={openItinerary} />
        : tab === "Golf" ? <>
          <GolfSlides key={String(competitive)} previewMatch={previewMatch} competitive={competitive} navigation={navigation} onNavigationChange={onNavigationChange} />
        </>
        : tab === "Venue" ? <GolfTripVenue draft={draft} settingsHref={settingsHref}
          latitude={coordinate(draft.destinationLatitude)} longitude={coordinate(draft.destinationLongitude)}
          players={travel?.members.map(member => member.name) ?? []} items={itinerary ?? []} onOpenItinerary={openItinerary} />
        : tab === "Info" ? <InfoSlides active={infoSlide} onActive={setInfoSlide} itinerary={itinerary} tripDays={dates}
          whoFor={id => travel ? travel.participants.filter(p => p.itemId === id.split(":")[0] && p.status === "going").map(p => travel.members.find(m => m.id === p.memberId)?.name ?? "").filter(Boolean) : []}
          myInfo={travel ? <GolfTripMyTravel travel={travel} onChange={changeMyTravel} /> : <VenueEvents />} />
        : <Card title={tab}><Empty>Coming soon</Empty></Card>}
    </div>
    {roundLive && <GolfTripScoring key={`${scoringOwner ?? "me"}-${scoringPrefill ? `prefilled-${scoringPrefill.otherCardDiff ? "mismatch" : "match"}` : "blank"}`} prefill={scoringPrefill} onSubmit={onScoringSubmit} submittedCard={submittedCard} par={previewMatch?.par} initialHoles={yourHoles} courseName={previewMatch?.course} playerName={you ? getPlayerDisplayName(you) : draft.yourName || "You"} opponentCardMatches={opponentCardMatches} />}
    <GolfTripChat open={chatOpen} onClose={() => setChatOpen(false)} tripName={draft.tripName || "Your Golf Trip"}
      members={[...new Set(previewMatch?.matches.flatMap(match => [match.left, match.right].flatMap(side => side ? normalizeCompetitor(side).golfers.map(golfer => getPlayerDisplayName(golfer.name)) : [])) ?? [])].filter(name => name !== getPlayerDisplayName(you ?? draft.yourName ?? ""))} />
  </main>;
}

/** A saved coordinate from the trip answers, or undefined when missing or not a number. */
const coordinate = (value: string | undefined) => value && Number.isFinite(Number(value)) ? Number(value) : undefined;

const HOME_SECTIONS = ["Golf", "The Trip", "Travelers", "Logistics"] as const;
type HomeSection = (typeof HOME_SECTIONS)[number];

/**
 * Home tab, search-sheet style: four cream cards, one open at a time. The open one shows a big title, then the Venue
 * tab's event-list rows (headings with a chevron; square picture with a "Set" / "To do" tag, small label, bold title,
 * detail lines); the others are short bars with the section on the left and a one-line summary on the right.
 * Tapping a bar opens it and closes the one that was open.
 */
function HomeSections({ draft, dates, dateRange, weather }: { draft: Record<string, string>; dates: string[]; dateRange: string; weather?: Promise<TripWeather> }) {
  const [open, setOpen] = useState<HomeSection>("Golf");
  const rounds = plannedRounds(draft);
  const tournament = draft.includesTournament ? TOURNAMENT_ANSWERS[draft.includesTournament] ?? "Not sure yet" : "";
  const nights = dates.length > 1 ? `${dates.length - 1} nights` : "";

  const heading = (text: string) => <h4 className={styles.eventsHeading}>{text}<ChevronRight size={20} strokeWidth={2.25} aria-hidden /></h4>;

  const nextImportantEvent: InfoEvent | null = rounds[0]
    ? {
        host: `Round ${rounds[0].number}`,
        title: `${draft[`round${rounds[0].number}Course`] || "Golf day"} · ${rounds[0].date ? shortTripDate(rounds[0].date) : `Day ${rounds[0].dayNumber}`}`,
        art: ART.golf,
        icon: Flag,
        badge: "Set",
      }
    : null;

  const sections: Record<HomeSection, { summary: string; rows: ReactNode }> = {
    Golf: {
      summary: nextImportantEvent ? "Round coming up" : "Golf plan",
      rows: <>
        {heading("Rounds")}
        {nextImportantEvent ? <EventRow event={{ ...nextImportantEvent, lines: [{ icon: CalendarDays, text: `${nextImportantEvent.title}` }] }} /> : <EventRow event={{ host: "Golf", title: "Round 1 · Course TBD", art: ART.golf, icon: Flag, badge: "To do", lines: [{ icon: CalendarDays, text: "Add the tee time and course" }] }} />}
        {heading("Tournament")}
        {(() => {
          const tournamentBadge: InfoEvent['badge'] = tournament ? "Set" : "To do";
          return <EventRow event={{ host: "Tournament", title: tournament || "Friendly side game", art: ART.tournament, icon: Trophy, badge: tournamentBadge, lines: tournament ? [{ icon: CalendarDays, text: tournament }] : [{ icon: Trophy, text: "Add the event info or side match" }] }} />;
        })()}
      </>,
    },
    "The Trip": {
      summary: draft.destination ? "Travel plan" : "Trip info",
      rows: <>
        {heading("Flights")}
        {draft.destination
          ? <EventRow event={{ host: "Flights", title: "AA1234 · RDU → DFW", art: ART.travel, icon: Plane,
            badge: "Set",
            lines: [{ icon: CalendarDays, text: dateRange || "Trip dates TBD" }, { icon: Clock, text: "Apr 22, 6:10 AM" }, { icon: MapPin, text: nights ? `${nights} in town` : "2 getting there · 1 heading home" }] }} />
          : <EventRow event={{ host: "Flights", title: "Flight details", art: ART.travel, icon: Plane, badge: "To do", lines: [{ icon: Clock, text: "Add the flight and arrival time" }] }} />}
        {weather && <Suspense fallback={<EventRow event={{ host: "Weather", title: "Loading forecast…", art: ART.weather, icon: Sun }} />}>
          <WeatherRow place={draft.destination} weather={weather} />
        </Suspense>}
        <EventRow event={{ host: "Dinner", title: "Dinner reservation · 8:00 PM", art: ART.photos, icon: Camera, badge: "Set", lines: [{ icon: Clock, text: "Confirm the group reservation" }] }} />
      </>,
    },
    Travelers: {
      summary: draft.yourName ? "Group arrivals" : "Travelers",
      rows: <>
        {heading("Travelers")}
        {draft.yourName
          ? <EventRow event={{ host: "Organizer", title: draft.yourName, art: ART.travelers, icon: User, badge: "Set", lines: [{ icon: Users, text: "Arrival window and who is driving" }] }} />
          : <EventRow event={{ host: "Travelers", title: "Add the group", art: ART.travelers, icon: Users, badge: "To do" }} />}
        <EventRow event={{ host: "Arrivals", title: "Who is arriving when", art: ART.travelers, icon: Users, badge: "Set", lines: [{ icon: MapPin, text: "Confirm ride share and pickup plans" }] }} />
      </>,
    },
    Logistics: {
      summary: "Stay + rides",
      rows: <>
        {heading("Lodging")}
        <EventRow event={{ host: "Lodging", title: "The Shorebreak Villas · 3 nights", art: ART.stay, icon: BedDouble, badge: "Set", lines: [{ icon: CalendarDays, text: "Check-in at 3:00 PM" }] }} />
        {heading("Transportation")}
        <EventRow event={{ host: "Transportation", title: "Airport shuttle · 10:15 AM", art: ART.transport, icon: Car, badge: "Set", lines: [{ icon: Clock, text: "Pickup at Terminal B" }] }} />
      </>,
    },
  };

  return <div className={styles.sheets}>
    {HOME_SECTIONS.map((name) => open === name
      ? <section key={name} className={styles.sheetOpen} aria-label={name}>
        <h3 className={styles.sheetTitle}>{name}</h3>
        <div className={`${styles.events} ${styles.sheetRows}`}>{sections[name].rows}</div>
      </section>
      : <button key={name} type="button" className={styles.sheetClosed} aria-expanded={false} onClick={() => setOpen(name)}>
        <span className={styles.sheetName}>{name}</span><span className={styles.sheetSummary}>{sections[name].summary}</span>
      </button>)}
  </div>;
}

/** Home's quick weather (right of "Your trip to"): degrees with a condition icon, the condition, low / high, and the chance of rain. */
function QuickWeather({ weather }: { weather: Promise<TripWeather> }) {
  const result = use(weather);
  if (result.status !== "ok") return <div className={styles.quickWeather}><span className={styles.quickCondition}>Weather unavailable</span></div>;
  const now = result.weather;
  const lowHigh = [now.low !== null && `L ${now.low}°`, now.high !== null && `H ${now.high}°`].filter(Boolean).join("  ");
  return <div className={styles.quickWeather} aria-label="Weather now">
    <span className={styles.quickTemp}><ConditionIcon condition={now.condition} />{now.temperature !== null ? `${now.temperature}°` : "—°"}</span>
    {now.condition && <span className={styles.quickCondition}>{now.condition}</span>}
    {lowHigh && <span className={styles.quickDetail}>{lowHigh}</span>}
    {now.precipitationChance !== null && <span className={styles.quickDetail}><Droplets size={13} strokeWidth={2.25} aria-hidden />{now.precipitationChance}%<span className={styles.srOnly}> chance of precipitation</span></span>}
  </div>;
}

/** A weather icon from the forecast's words ("Sunny", "Partly Cloudy", "Chance Rain Showers", …). */
function ConditionIcon({ condition }: { condition: string | null }) {
  const words = (condition ?? "").toLowerCase();
  const props = { size: 22, strokeWidth: 2, "aria-hidden": true } as const;
  if (/thunder|storm/.test(words)) return <CloudLightning {...props} />;
  if (/snow|sleet|flurr|ice/.test(words)) return <CloudSnow {...props} />;
  if (/rain|shower|drizzle/.test(words)) return <CloudRain {...props} />;
  if (/fog|haze|smoke/.test(words)) return <CloudFog {...props} />;
  if (/partly|mostly sunny|mostly clear|few clouds/.test(words)) return <CloudSun {...props} />;
  if (/cloud|overcast/.test(words)) return <Cloud {...props} />;
  return <Sun {...props} />;
}

/** The Trip's Weather row once the server's weather promise settles (Suspense shows the loading row until then). Lines with no data are left out. */
function WeatherRow({ place, weather }: { place?: string; weather: Promise<TripWeather> }) {
  const result = use(weather);
  if (result.status !== "ok") return <EventRow event={{ host: "Weather", art: ART.weather, icon: Sun,
    title: result.status === "unavailable" ? "Forecast temporarily unavailable" : "Weather unavailable" }} />;
  const now = result.weather;
  const highLow = [now.high !== null && `High ${now.high}°`, now.low !== null && `Low ${now.low}°`].filter(Boolean).join(" · ");
  const wind = [now.windDirection, now.windSpeed].filter(Boolean).join(" ");
  const title = [now.temperature !== null && `${now.temperature}°${now.temperatureUnit}`, now.condition].filter(Boolean).join(" · ");
  return <EventRow event={{ host: place ? `Weather · ${place}` : "Weather", title: title || "Weather", art: ART.weather, icon: Sun,
    lines: [highLow && { icon: Thermometer, text: highLow }, now.precipitationChance !== null && { icon: CloudRain, text: `Rain ${now.precipitationChance}%` },
      wind && { icon: Wind, text: `Wind ${wind}` }] }} />;
}

/** Golf sections share the existing responsive scroll-snap strip and tab styling. */
function GolfSlides({ previewMatch, competitive, navigation, onNavigationChange }: { previewMatch?: GolfMatchPreview; competitive: boolean; navigation?: GolfTripNavigation; onNavigationChange?: (navigation: GolfTripNavigation) => void }) {
  // Competition is about the round being played: only that round's matches (matches without a round count as current).
  const roundMatch = useMemo(() => previewMatch && { ...previewMatch, matches: previewMatch.matches.filter(pairing => pairing.round === undefined || pairing.round === previewMatch.round) }, [previewMatch]);
  const trackRef = useRef<HTMLDivElement>(null);
  const availableSlides = GOLF_SLIDES.filter((name) => name !== "Competition" || competitive);
  const requested = Math.max(0, availableSlides.findIndex(section => section === navigation?.golfSection));
  const [selection, setSelection] = useState({ navigation, active: requested });
  if (selection.navigation !== navigation) setSelection({ navigation, active: requested });
  const active = selection.navigation === navigation ? selection.active : requested;
  const setActive = (active: number) => setSelection({ navigation, active });
  const gamesActive = availableSlides[active] === "Games";
  const golfSection = availableSlides[active] ?? "Overview";
  useEffect(() => {
    onNavigationChange?.({ tab: "Golf", golfSection });
  }, [golfSection, onNavigationChange]);

  useEffect(() => {
    const track = trackRef.current;
    if (!track || gamesActive) return;
    // Keep the chosen panel aligned when the mobile/desktop viewport changes.
    const observer = new ResizeObserver(() => {
      track.scrollTo({ left: active * track.clientWidth, behavior: "instant" });
    });
    observer.observe(track);
    return () => observer.disconnect();
  }, [active, gamesActive]);

  const goTo = (index: number) => {
    setActive(index);
    // Keep the interactive Games panel outside the swipe strip.
    if (availableSlides[index] !== "Games") requestAnimationFrame(() => {
      const track = trackRef.current;
      if (track) track.scrollTo({ left: index * track.clientWidth, behavior: "instant" });
    });
  };
  const onScroll = () => {
    const track = trackRef.current;
    if (!gamesActive && track && track.clientWidth > 0) setActive(Math.round(track.scrollLeft / track.clientWidth));
  };

  return <>
    {/* Top box: a summary leaderboard for the section — the whole tournament on Overview, the round being played on
        Competition, games (placeholder) on Games. All three share one grid cell so the tabs don't move when it switches.
        The weather lives on Home. */}
    {previewMatch && <div className={styles.golfTop}>
      {(["Overview", "Competition", "Games"] as const).map(section => {
        const shown = (availableSlides[active] ?? "Overview") === section;
        // Overview's box sets the size; Competition and Games fill exactly that box.
        return <div key={section} className={`${section === "Overview" ? styles.golfTopSize : styles.golfTopFill} ${shown ? "" : styles.golfTopHidden}`} inert={!shown}>
          {section === "Overview" ? <GolfTournamentSummary match={previewMatch} />
            : section === "Competition" ? <GolfMatchup match={roundMatch ?? previewMatch} showDots compact /> : <GolfGamesSummary />}
        </div>;
      })}
    </div>}
    <div className={styles.tabs} role="tablist" aria-label="Golf sections">
      {availableSlides.map((name, i) => <button key={name} type="button" role="tab" aria-selected={active === i}
        className={`${styles.tab} ${active === i ? styles.tabActive : ""}`} onClick={() => goTo(i)}>{name}</button>)}
    </div>
    <div ref={trackRef} className={styles.slides} style={gamesActive ? { display: "none" } : undefined} onScroll={onScroll}>
      {availableSlides.filter(name => name !== "Games").map((name, i) => <div key={name} className={styles.slide} role="tabpanel" aria-label={name} inert={active !== i}>
        {name === "Overview"
          ? previewMatch ? <GolfTripLeaderboard match={previewMatch} /> : <Card title="Score Overview"><Empty>Your leaderboard and round scores will show here</Empty></Card>
          : roundMatch ? <GolfTripCompetitionMatchPreview initialMatch={roundMatch} /> : <Card title="Competition"><Empty>Your matchups will show here</Empty></Card>}
      </div>)}
    </div>
    <div role="tabpanel" aria-label="Games" hidden={!gamesActive}>
      {previewMatch ? <GolfTripGames /> : <Card title="Games"><Empty>Golf games are coming soon</Empty></Card>}
    </div>
  </>;
}

type EventLine = { icon: LucideIcon; text: string };
const TRIP_BADGES = ["Set", "Waitlisted", "Going", "Invited", "To do"] as const;
type TripBadge = (typeof TRIP_BADGES)[number];
/** One row in the event-list style. `art` stands in for a picture (an optional icon sits on it); `lines` skips empty entries. */
type InfoEvent = { host: string; title: string; art: string; icon?: LucideIcon; kindIcon?: ItineraryKind; lines?: (EventLine | false | "" | undefined)[];
  badge?: TripBadge; price?: string };

/** Home tab picture colors, one per part of the trip. */
const ART = {
  travel: "linear-gradient(135deg,#8a2433,#4a0f19)", weather: "linear-gradient(135deg,#f5b544,#d9772b)", stay: "linear-gradient(135deg,#6b7fa8,#2f3e5f)",
  transport: "linear-gradient(135deg,#7a7a7a,#3a3a3a)", golf: "linear-gradient(135deg,#3f8a55,#1c4a2b)", tournament: "linear-gradient(135deg,#dcc495,#a8894e)",
  travelers: "linear-gradient(135deg,#b06a8a,#6a2f4c)", itinerary: "linear-gradient(135deg,#5c8f9e,#2c5361)", expenses: "linear-gradient(135deg,#9a8a6a,#5a4d33)",
  photos: "linear-gradient(135deg,#e07a5f,#a8432c)",
};

type InfoSectionKey = "gettingThere" | "lodging" | "transportation";

type InfoEntry = {
  id: string;
  title: string;
  host: string;
  detail: string;
  art: string;
  badge?: InfoEvent["badge"];
};

const INITIAL_GETTING_THERE: InfoEntry[] = [
  { id: "flight-1", host: "Getting there", title: "United 452 · Denver to San Diego", detail: "Today, 6:20AM · DEN → SAN", art: "linear-gradient(135deg,#6a1f2b,#a22d3d)", badge: "Set" },
  { id: "flight-2", host: "Getting there", title: "Rental car pickup", detail: "Pickup 10:15AM · Airport lot B", art: "linear-gradient(135deg,#5a5d6b,#2e3240)", badge: "Set" },
];

const INITIAL_LODGING: InfoEntry[] = [
  { id: "lodging-1", host: "Lodging", title: "The Shorebreak Villas · 3 nights", detail: "Check-in 3:00PM · Oceanfront, 2 bedrooms", art: "linear-gradient(135deg,#c9b38b,#7d603a)", badge: "Set" },
];

const INITIAL_TRANSPORTATION: InfoEntry[] = [
  { id: "transport-1", host: "Transportation", title: "Airport shuttle to the resort", detail: "Pickup at 10:15AM · Terminal B · 4 seats", art: "linear-gradient(135deg,#5a5d6b,#2e3240)", badge: "Set" },
];

/** Info tab: trip logistics with add/remove controls and a delete-confirm flow. */
function VenueEvents() {
  const [gettingThere, setGettingThere] = useState(INITIAL_GETTING_THERE);
  const [lodging, setLodging] = useState(INITIAL_LODGING);
  const [transportation, setTransportation] = useState(INITIAL_TRANSPORTATION);
  const [confirmDelete, setConfirmDelete] = useState<{ section: InfoSectionKey; entry: InfoEntry } | null>(null);
  const [toast, setToast] = useState<{ section: InfoSectionKey; entry: InfoEntry; closing: boolean } | null>(null);
  const [sheetSection, setSheetSection] = useState<InfoSectionKey | null>(null);
  const nextEntryIdRef = useRef(0);

  const quickActionRows = [
    { label: "Contact Pura", icon: MessageCircle },
    { label: "Visit online store", icon: ExternalLink },
    { label: "Share", icon: Share2 },
    { label: "Refund policy", icon: ShieldCheck },
    { label: "Shipping policy", icon: ShoppingBag },
    { label: "Privacy policy", icon: LockKeyhole },
    { label: "Terms and conditions", icon: FileText },
    { label: "Report", icon: AlertTriangle },
  ] as const;

  const addQuickEntry = (option: string) => {
    if (!sheetSection) return;
    const next: InfoEntry = {
      id: `new-${sheetSection}-${nextEntryIdRef.current++}`,
      host: sheetSection === "gettingThere" ? "Getting there" : sheetSection === "lodging" ? "Lodging" : "Transportation",
      title: option,
      detail: sheetSection === "gettingThere" ? "Added for this trip" : sheetSection === "lodging" ? "Stay details" : "Pickup details",
      art: sheetSection === "gettingThere" ? "linear-gradient(135deg,#6a1f2b,#a22d3d)" : sheetSection === "lodging" ? "linear-gradient(135deg,#c9b38b,#7d603a)" : "linear-gradient(135deg,#5a5d6b,#2e3240)",
      badge: "Set",
    };

    if (sheetSection === "gettingThere") setGettingThere(current => [...current, next]);
    else if (sheetSection === "lodging") setLodging(current => [...current, next]);
    else setTransportation(current => [...current, next]);

    setSheetSection(null);
  };

  const openAddSheet = (section: InfoSectionKey) => {
    setSheetSection(section);
  };

  const removeEntry = (section: InfoSectionKey, entry: InfoEntry) => {
    setConfirmDelete(null);
    if (section === "gettingThere") setGettingThere(current => current.filter(item => item.id !== entry.id));
    else if (section === "lodging") setLodging(current => current.filter(item => item.id !== entry.id));
    else setTransportation(current => current.filter(item => item.id !== entry.id));

    setToast({ section, entry, closing: false });

    setTimeout(() => {
      setToast((current) => current ? { ...current, closing: true } : current);
    }, 4800);

    setTimeout(() => {
      setToast((current) => current && current.entry.id === entry.id ? null : current);
    }, 6000);

    const restore = () => {
      if (section === "gettingThere") setGettingThere(current => [entry, ...current.filter(item => item.id !== entry.id)]);
      else if (section === "lodging") setLodging(current => [entry, ...current.filter(item => item.id !== entry.id)]);
      else setTransportation(current => [entry, ...current.filter(item => item.id !== entry.id)]);
      setToast(null);
    };

    (globalThis as typeof globalThis & { __maroonUndo?: () => void }).__maroonUndo = restore;
  };

  useEffect(() => () => {
    (globalThis as typeof globalThis & { __maroonUndo?: () => void }).__maroonUndo = undefined;
  }, []);

  const renderSection = (key: InfoSectionKey, title: string, entries: InfoEntry[], onAdd: () => void) => <section key={key} className={styles.infoSection}>
    <div className={styles.infoHeaderRow}>
      <h2 className={styles.eventsHeading}>{title}</h2>
    </div>
    {entries.map((entry) => <article key={entry.id} className={styles.infoEntry}>
      <button type="button" className={styles.entryDelete} aria-label={`Delete ${entry.title}`} onClick={() => setConfirmDelete({ section: key, entry })}>
        <Trash2 size={14} strokeWidth={2} aria-hidden />
      </button>
      <div className={styles.eventArt} style={{ background: entry.art }} aria-hidden />
      <div className={styles.eventInfo}>
        <p className={styles.eventHost}><span className={styles.eventAvatar} aria-hidden />{entry.host}</p>
        <h3 className={styles.eventTitle}>{entry.title}</h3>
        <p className={styles.eventMeta}><Clock size={14} strokeWidth={2} aria-hidden />{entry.detail}</p>
      </div>
    </article>)}
    <button type="button" className={styles.addItemButton} onClick={onAdd}><Plus size={16} strokeWidth={2.5} aria-hidden />Add</button>
  </section>;

  return <div className={styles.events}>
    {renderSection("gettingThere", "Getting there", gettingThere, () => openAddSheet("gettingThere"))}
    {renderSection("lodging", "Lodging", lodging, () => openAddSheet("lodging"))}
    {renderSection("transportation", "Transportation", transportation, () => openAddSheet("transportation"))}

    {sheetSection && <GolfTripActionSheet label="Add trip item" onClose={() => setSheetSection(null)}
      actions={[...quickActionRows]} onAction={addQuickEntry} />}

    {confirmDelete && <div className={styles.deleteOverlay} role="dialog" aria-modal="true" aria-label="Delete item confirmation">
      <div className={styles.deleteDialog}>
        <p className={styles.deletePrompt}>Are you sure?</p>
        <button type="button" className={styles.cancelButton} onClick={() => setConfirmDelete(null)}>Cancel</button>
        <button type="button" className={styles.deleteButton} onClick={() => {
          removeEntry(confirmDelete.section, confirmDelete.entry);
          setConfirmDelete(null);
        }}>Delete</button>
      </div>
    </div>}

    {toast && <div className={`${styles.toast} ${toast.closing ? styles.toastClosing : ""}`} role="status" aria-live="polite">
      <div>
        <strong>Item deleted</strong>
        <span>{toast.entry.title}</span>
      </div>
      <button type="button" className={styles.toastUndo} onClick={() => {
        const fn = (globalThis as typeof globalThis & { __maroonUndo?: () => void }).__maroonUndo;
        if (fn) fn();
        setToast(null);
      }}>Undo</button>
    </div>}
  </div>;
}

function EventRow({ event }: { event: InfoEvent }) {
  return <article className={styles.eventRow}>
    <div className={styles.eventArt} style={{ background: event.art }}>
      {event.icon && <event.icon size={30} strokeWidth={1.75} aria-hidden />}
      {event.kindIcon && <TravelKindIcon kind={event.kindIcon} size={26} />}
      {event.badge && <span className={`${styles.eventBadge} ${styles[`badge${event.badge.replace(" ", "")}`]}`}>{event.badge}</span>}
    </div>
    <div className={styles.eventInfo}>
      <p className={styles.eventHost}><span className={styles.eventAvatar} aria-hidden /><span>{event.host}</span>
        {event.price && <span className={styles.eventPrice}>{event.price}</span>}</p>
      <h3 className={styles.eventTitle}>{event.title}</h3>
      {event.lines?.map((line) => line && <p key={line.text} className={styles.eventMeta}><line.icon size={14} strokeWidth={2} aria-hidden />{line.text}</p>)}
    </div>
  </article>;
}

/** A Home "what's next" card: what it is, the headline, when, and one more line. Opens Info → Itinerary. */
function ItineraryCard({ item, label: status, onOpen }: { item: ItineraryItem; label?: "Live" | "Upcoming"; onOpen: () => void }) {
  const when = `${itineraryDay(item.startsAt)} · ${itineraryTime(item.startsAt)}`;
  const label = ITINERARY_KIND_LABEL[item.kind];
  return <button type="button" className={`${styles.accountCard} ${styles.itineraryCard}`} onClick={onOpen}
    aria-label={`${status ? `${status}: ` : ""}${label}: ${item.title}, ${when}${item.detail ? `, ${item.detail}` : ""}. Open the itinerary`}>
    {status && <p className={styles.liveLabel} data-live={status === "Live"}>{status}</p>}
    <p className={styles.accountCardName}><TravelKindIcon kind={item.kind} size={14} /> {label}</p>
    <p className={styles.accountCardAmount}>{item.title}</p>
    <p className={styles.accountCardNote}>{when}</p>
    {item.detail && <p className={styles.accountCardNote}>{item.detail}</p>}
  </button>;
}

/** Info tab: a slider with My Info (your travel; for trips without travel data, the older getting there / lodging / transportation lists) and Itinerary (everything, by day). Tap or swipe. */
const INFO_SLIDES = ["My Info", "Itinerary"] as const;
function InfoSlides({ active, onActive, itinerary, tripDays, myInfo, whoFor }: { active: number; onActive: (index: number) => void; itinerary?: ItineraryItem[]; tripDays: string[]; myInfo: ReactNode; whoFor?: (itemId: string) => string[] }) {
  const trackRef = useRef<HTMLDivElement>(null);
  // True while a tab tap is sliding the track, so the scroll handler doesn't read the halfway point as a swipe.
  const sliding = useRef(false);
  // Follow the chosen tab (taps, or a Home card opening Itinerary): slide there in 100 ms (snapping paused while it moves).
  useEffect(() => {
    const track = trackRef.current;
    if (!track || Math.round(track.scrollLeft / Math.max(1, track.clientWidth)) === active) return;
    const from = track.scrollLeft, to = active * track.clientWidth;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { track.scrollTo({ left: to, behavior: "instant" }); return; }
    track.style.scrollSnapType = "none";
    sliding.current = true;
    const start = performance.now();
    let frame = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / 100);
      track.scrollLeft = from + (to - from) * (1 - (1 - t) ** 3);
      if (t < 1) frame = requestAnimationFrame(step);
      else { track.style.scrollSnapType = ""; sliding.current = false; }
    };
    frame = requestAnimationFrame(step);
    return () => { cancelAnimationFrame(frame); track.style.scrollSnapType = ""; sliding.current = false; };
  }, [active]);
  const onScroll = () => {
    if (sliding.current) return;
    const track = trackRef.current;
    if (track && track.clientWidth > 0) { const index = Math.round(track.scrollLeft / track.clientWidth); if (index !== active) onActive(index); }
  };
  return <>
    <div className={`${styles.tabs} ${styles.infoTabs}`} role="tablist" aria-label="Info sections">
      {INFO_SLIDES.map((name, index) => <button key={name} type="button" role="tab" aria-selected={active === index}
        className={`${styles.tab} ${active === index ? styles.tabActive : ""}`} onClick={() => onActive(index)}>{name}</button>)}
    </div>
    <div ref={trackRef} className={styles.slides} onScroll={onScroll}>
      <div className={styles.slide} role="tabpanel" aria-label="My Info" inert={active !== 0}>{myInfo}</div>
      <div className={styles.slide} role="tabpanel" aria-label="Itinerary" inert={active !== 1}><ItineraryList items={itinerary} tripDays={tripDays} whoFor={whoFor} /></div>
    </div>
  </>;
}

/**
 * Info → Itinerary: one day at a time. A day selector (< weekday / date >) over a line, then that day's plans in time order.
 * Days run from the trip's first day (plus any earlier day with something on it) to its last; no < on the first, no > on the last.
 * Opens on today when today is one of the days.
 */
function ItineraryList({ items, tripDays, whoFor }: { items?: ItineraryItem[]; tripDays: string[]; whoFor?: (itemId: string) => string[] }) {
  const days = itineraryByDay(items ?? [], tripDays);
  const [picked, setPicked] = useState<number | null>(null);
  // Tap a plan's box → its detail sheet slides up.
  const [openItem, setOpenItem] = useState<ItineraryItem | null>(null);
  const [todayIso] = useState(() => localNow(new Date()).slice(0, 10));
  // Arrows: the day slides away (50 ms), then the next one slides in from that side (50 ms) — 100 ms in all.
  const [slide, setSlide] = useState<{ to: number; dir: 1 | -1; stage: "out" | "in" } | null>(null);
  if (!days.length) return <Card title="Itinerary"><Empty>Nothing on the itinerary yet</Empty></Card>;
  const today = days.findIndex(({ day }) => day === todayIso);
  const index = Math.min(days.length - 1, picked ?? Math.max(0, today));
  const { day, items: dayItems } = days[index];
  const go = (dir: 1 | -1) => {
    if (slide) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) setPicked(index + dir);
    else setSlide({ to: index + dir, dir, stage: "out" });
  };
  const slideClass = !slide ? "" : slide.stage === "out" ? (slide.dir === 1 ? styles.dayOutLeft : styles.dayOutRight) : (slide.dir === 1 ? styles.dayInRight : styles.dayInLeft);
  const onSlideEnd = () => {
    if (slide?.stage === "out") { setPicked(slide.to); setSlide({ ...slide, stage: "in" }); }
    else setSlide(null);
  };
  return <div className={styles.events}>
    <section className={styles.infoSection} aria-label={`${itineraryWeekday(day)}, ${itineraryLongDate(day)}`}>
      <div className={styles.itineraryDayHeading}>
        {index > 0 ? <button type="button" className={styles.itineraryDayStep} aria-label="Previous day" onClick={() => go(-1)}><ChevronLeft size={22} strokeWidth={2.25} aria-hidden /></button> : <span className={styles.itineraryDayStep} aria-hidden />}
        <h2 className={`${styles.itineraryDayTitle} ${slideClass}`}><span>{itineraryWeekday(day)}</span><small>{itineraryLongDate(day)}</small></h2>
        {index < days.length - 1 ? <button type="button" className={styles.itineraryDayStep} aria-label="Next day" onClick={() => go(1)}><ChevronRight size={22} strokeWidth={2.25} aria-hidden /></button> : <span className={styles.itineraryDayStep} aria-hidden />}
      </div>
      <div className={`${styles.itineraryDayBody} ${slideClass}`} onAnimationEnd={event => { if (event.target === event.currentTarget) onSlideEnd(); }}>
      {dayItems.length === 0 && <p className={styles.itineraryEmptyDay}>Nothing planned for today.</p>}
      {/* Each of your plans that day: its type above, then a raised cream box (like Competition → Format rounds) with the time over a line, the headline and details. Tap for its sheet. */}
      {dayItems.map((item, index) => <div key={item.id} className={styles.itineraryEntry}>
        {/* The type sits above its box in cream, left-aligned, over a line — once for a run of the same type back to back. */}
        {(index === 0 || itineraryCategory(dayItems[index - 1]) !== itineraryCategory(item)) && <h3 className={styles.itineraryType}>{itineraryCategory(item)}</h3>}
        <button type="button" className={styles.itineraryBox} aria-haspopup="dialog" aria-label={`${itineraryCategory(item)}: ${item.title}, ${itineraryTime(item.startsAt)}`} onClick={() => setOpenItem(item)}>
          <div className={styles.itineraryBoxTop}>
            <span className={styles.itineraryBoxTime}>{itineraryTime(item.startsAt)}</span>
          </div>
          <span className={styles.itineraryBoxTitle}>{item.title}</span>
          {item.detail && <span className={styles.itineraryBoxTime}>{item.detail}</span>}
        </button>
      </div>)}
      </div>
    </section>
    {openItem && <ItineraryDetailSheet item={openItem} going={whoFor?.(openItem.id) ?? []} onClose={() => setOpenItem(null)} />}
  </div>;
}

/** Info → Flights card (in the first account-card slot): your next flight and how many you've saved; opens the Flights page. */
function FlightsCard({ flights }: { flights?: TripFlights }) {
  const summary = flights?.summary;
  const next = summary?.next;
  const counts = summary ? flightCounts(summary) : "";
  const content = <>
    <p className={styles.accountCardName}><Plane size={14} strokeWidth={2} aria-hidden /> Flights</p>
    <p className={styles.accountCardAmount}>{next ? `${next.flightNumber} · ${next.departureAirport} → ${next.arrivalAirport}` : counts ? "No upcoming flights" : "Add your flights"}</p>
    {next && <p className={styles.accountCardNote}>{flightTime(next.departureLocal)}</p>}
    {counts && <p className={styles.accountCardNote}>{counts}</p>}
  </>;
  return flights?.href
    ? <Link href={flights.href} className={`${styles.accountCard} ${styles.accountCardLink}`} aria-label={`Flights: ${next ? `next ${next.flightNumber}` : counts || "add your flights"}`}>{content}</Link>
    : <div className={styles.accountCard}>{content}</div>;
}

/**
 * Info tab, banking-app style (layout only, made-up numbers): a maroon top saying "Your trip to {destination}", a swipeable
 * row of two cards with a dot for each (the filled dot follows the swipe), then the upcoming trip and planned rounds. It runs edge to edge and down to the bottom of the screen.
 */
function InfoAccount({ draft, settingsHref, flights, weather, itinerary, onOpenItinerary }: {
  draft: GolfTripDraft; settingsHref: string; flights?: TripFlights; weather?: Promise<TripWeather>; itinerary?: ItineraryItem[]; onOpenItinerary: () => void;
}) {
  const destination = draft.destination;
  const tripDateRange = dateRangeLabel(draft.startDate, draft.endDate);
  // Live (what's happening now) and Upcoming (what's next); before the trip, the first two upcoming. "now" is read once, when Home opens.
  const [now] = useState(() => localNow(new Date()));
  const boxes = itinerary ? liveAndUpcoming(itinerary, now) : [];
  return <div className={styles.account}>
    <div className={styles.accountTop}>
      {/* Left 65%: "Your trip to", the destination under it, then the trip's dates in gold (left out if there are none). */}
      <div className={styles.accountTitleBlock}>
        {/* Always two rows: "Your trip to", then "City, ST" (US) or "City, CC" (country code abroad) on one line. */}
        <p className={styles.accountLabel}>{destination ? <>Your trip to<span className={styles.accountDestination} title={destination}>{shortPlace(destination)}</span></> : "Your trip"}</p>
        {tripDateRange && <p className={styles.accountDates}>{tripDateRange}</p>}
      </div>
      {/* Right 35%: quick weather at the destination (only when the trip has a weather lookup). */}
      {weather && <Suspense fallback={<div className={styles.quickWeather} role="status"><span className={styles.quickTemp}>—°</span><span className={styles.quickCondition}>Loading weather…</span></div>}>
        <QuickWeather weather={weather} />
      </Suspense>}
    </div>
    {/* Two boxes, one over the other, 5% in from each side: Live then Upcoming (or two Upcoming before anything is live).
        Tap one to open Info → Itinerary. Trips without an itinerary keep the Flights card. */}
    <div className={styles.liveBoxes}>
      {itinerary
        ? boxes.length
          ? boxes.map(({ label, item }) => <ItineraryCard key={item.id} label={label} item={item} onOpen={onOpenItinerary} />)
          : <button type="button" className={`${styles.accountCard} ${styles.itineraryCard}`} onClick={onOpenItinerary}>
            <p className={styles.accountCardName}><CalendarDays size={14} strokeWidth={2} aria-hidden /> Itinerary</p>
            <p className={styles.accountCardAmount}>Nothing else coming up</p>
            <p className={styles.accountCardNote}>See the full itinerary</p>
          </button>
        : <FlightsCard flights={flights} />}
    </div>
    <GolfTripItinerary draft={draft} settingsHref={settingsHref} />
  </div>;
}

/** "Jan 7 – Jan 10, 2026": the year once, on the second date (on both if the trip crosses a year); one date if only one is set. */
function dateRangeLabel(start: string | undefined, end: string | undefined): string {
  const format = (day: string, withYear: boolean) => new Date(`${day}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", ...(withYear ? { year: "numeric" } : {}), timeZone: "UTC" });
  const from = validDay(start) ? start! : null, to = validDay(end) ? end! : null;
  if (from && to) return `${format(from, from.slice(0, 4) !== to.slice(0, 4))} – ${format(to, true)}`;
  return from || to ? format((from ?? to)!, true) : "";
}

/** A saved trip date (YYYY-MM-DD) that can be shown. */
const validDay = (value: string | undefined) => !!value && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));

export function Card({ title, children }: { title: string; children: ReactNode }) {
  return <section className={styles.card} aria-label={title}>
    <h2 className={styles.cardTitle}>{title}</h2>
    {children}
  </section>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className={styles.empty}>{children}</p>;
}
