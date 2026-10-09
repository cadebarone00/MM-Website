"use client";

import { Suspense, use, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ComponentProps, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { AlertTriangle, ArrowLeft, BedDouble, Bell, CalendarDays, Camera, Car, ChevronLeft, ChevronRight, Clock, Cloud, CloudFog, CloudLightning, CloudRain, CloudSnow, CloudSun, Droplets, ExternalLink, FileText, Flag, LockKeyhole, MapPin, MessageCircle, Plane, Plus, Settings, Share2, ShieldCheck, ShoppingBag, Sun, Thermometer, Trash2, Trophy, User, Users, Wind, X, type LucideIcon } from "lucide-react";
import { golfTripDraftSnapshot, parseGolfTripDraft, type GolfTripDraft, plannedRounds, shortTripDate, tripDates } from "@/lib/platform/golfTripDraft";
import { normalizeCompetitor, type GolfMatchPreview } from "@/lib/platform/golfTripPreviewFixture";
import { ITINERARY_KIND_LABEL, itineraryByDay, itineraryCategory, itineraryDay, itineraryLongDate, itineraryTime, itineraryWeekday, homeBoxes, localNow, withGolfRounds, type HomeStatus, type ItineraryItem, type ItineraryKind } from "@/lib/platform/golfTripItinerary";
import { addMyItem, itineraryFor, removeMyItem, updateMyItem, type TripTravel } from "@/lib/platform/tripTravel";
import { GolfTripAddTravel, type MyTravelChange } from "./GolfTripMyTravel";
import { TravelKindIcon } from "./travelKinds";
import type { TripWeather } from "@/lib/platform/weather/types";
import { flightCounts, flightTime, type FlightSummary } from "@/lib/platform/golfTripFlights";

/** The Info tab's Flights card: the viewer's flight summary, and the Flights page it opens (null = not a link). */
export interface TripFlights { summary: FlightSummary; href: string | null }
import { MatchNav, GolfGamesSummary, GolfMatchup, GolfRoundInfo, GolfTeeSheet, GolfTournamentSummary, GolfTripLeaderboard } from "./GolfTripMatch";
import { GolfTripScoring } from "./GolfTripScoring";
import { GolfTripStats, type ScoreChangeLine, type TripStatsView } from "./GolfTripStats";
import type { ScoreEdit } from "@/lib/platform/playerRounds";
import type { SheetCard } from "@/lib/platform/liveCards";
import { GolfTripCompetitionMatchPreview } from "./GolfTripCompetitionMatchPreview";
import { GolfTripActionSheet } from "./GolfTripActionSheet";
import { GolfTripGames } from "./GolfTripGames";
import { GolfTripChat } from "./GolfTripChat";
import { GolfTripItinerary, GolfTripVenue } from "./GolfTripVenue";
import { ItineraryDetailSheet } from "./ItineraryDetailSheet";
import { shortPlace } from "@/lib/platform/placeLabel";
import { MomSection } from "./MomSection";
import type { MomRound } from "@/lib/platform/momNotifications";
import { TripMomentumFeed } from "./TripMomentumFeed";
import { useTripMomentum, type TripAlertScope } from "./useTripMomentum";
import { GolfTripNotifications } from "./GolfTripNotifications";
import { getPlayerDisplayName } from "@/lib/data/players";
import styles from "./GolfTripHome.module.css";

import { GOLF_TRIP_TABS as TABS, golfSections, type CompetitionStructure, type GolfTripNavigation } from "@/lib/platform/golfTripNavigation";
import { useGolfTripCompetitionPreview } from "./GolfTripCompetitionPreviewProvider";
import { useSwipe } from "./useSwipe";
import { usePlayerStats } from "@/lib/platform/playerStatsSetting";
import { setRoundRsvp, useRoundRsvps } from "@/lib/platform/roundRsvp";
import { useInAppScoring } from "@/lib/platform/inAppScoringSetting";
import { teamColor } from "@/lib/platform/teamColors";
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
 * `now` (dev simulator only) is the trip clock, "YYYY-MM-DDTHH:mm:ss": Home's countdown, Live / Upcoming, Mom notes and the
 * Itinerary's opening day follow it (and keep ticking from it). Without it they use the device's clock.
 * `competitionKey` (dev) says which trip data this is, so the Golf tab follows that trip's Individual / Team picks in Settings.
 * `roundLive` shows the Scoring sheet: only while a round is being played (or finished but not yet submitted). Before the
 * first round, between rounds and after the trip there is nothing to score. Saved trips have no round data yet, so no sheet.
 * `navigation` optionally requests a shared tab/section; in-app navigation remains local between requests.
 * `onNavigationChange` optionally observes the actual tab/section; the dev wrapper supplies it only when embedded.
 */
export function GolfTripHome({ preview, settingsHref, backHref, previewMatch, weather, flights, travel: travelSeed, navigation, onNavigationChange, now: tripNow, competitionKey, savedCompetitionType, savedTeamColors, onTravelChange, roundLive = false, opponentCardMatches, scoringPrefill, onScoringSubmit, submittedCard, scoringOwner, tripStats, scoreChanges, attesteeName, scoringEdits, onScoringCardChange, attestedStrokes, onAttestChange, scoringPlayerName, savedScoringCard, attesteeStrokes, scoresVerified, syncStatus, conflicts, onResolveConflict, resetScoringCard, corrections, onRequestCorrection, onDecideCorrection, alertScope }:
  { preview?: GolfTripDraft; settingsHref: string; backHref?: string; previewMatch?: GolfMatchPreview; weather?: Promise<TripWeather>; flights?: TripFlights;
    /** Everyone's travel (My Info, the Itinerary and the Home "what's next" cards). Only the dev mock trip has it for now. */
    travel?: TripTravel; navigation?: GolfTripNavigation; onNavigationChange?: (navigation: GolfTripNavigation) => void; now?: string; competitionKey?: string;
    /** Each team's color (TEAM_COLORS ids, Team A first) saved with the trip, until Settings picks them in this session. */
    savedTeamColors?: (string | null)[];
    /** Dev Just created trip: its saved Individual / Team picks (used until Settings is opened this session). */
    savedCompetitionType?: { individual: string | null; team: string | null };
    /** Told about every change to my travel (dev Just created trip saves it). */
    onTravelChange?: (travel: TripTravel) => void;
    roundLive?: boolean;
    alertScope?: TripAlertScope;
    /** Dev preview only: whether the opponent's own scorecard agrees with mine (there is no second scorer yet). Without it, Save & Submit never shows. */
    opponentCardMatches?: boolean;
    /** Dev preview only: a finished-but-unsubmitted Scoring card (the "End of round" conditionals). */
    scoringPrefill?: ComponentProps<typeof GolfTripScoring>["prefill"];
    /** Player rounds: Submit & Save hands over the card; a round already saved for this player reopens locked. */
    onScoringSubmit?: ComponentProps<typeof GolfTripScoring>["onSubmit"]; submittedCard?: ComponentProps<typeof GolfTripScoring>["submittedCard"];
    /** Whose card this is (dev: the signed-in mock account). A different person gets a fresh Scoring sheet. */
    scoringOwner?: string;
    /** Dev preview (Player & Attest): trip stats and the organizer's own score changes under the Overview leaderboard. */
    tripStats?: TripStatsView; scoreChanges?: ScoreChangeLine[];
    /** Player & Attest data for the Scoring sheet: whose score I keep, a saved round's organizer changes, and the live card. */
    attesteeName?: string; scoringEdits?: ScoreEdit[]; onScoringCardChange?: (card: SheetCard) => void;
    /** The second phone: my attester's entries for me, and my entries for the player I attest. */
    attestedStrokes?: (number | null)[]; onAttestChange?: (strokes: (number | null)[], entered: boolean[]) => void;
    /** A saved trip's scoring: the signed-in golfer's name on the card, and their card in progress to start from. */
    scoringPlayerName?: string; savedScoringCard?: ComponentProps<typeof GolfTripScoring>["savedCard"];
    /** Live sync (saved trips): my attestee's own strokes, and whether my scores are saved and current. */
    attesteeStrokes?: (number | null)[]; scoresVerified?: boolean;
    /** Offline scoring (saved trips): sync status, conflicts to settle, and a card to put back on screen. */
    syncStatus?: ComponentProps<typeof GolfTripScoring>["syncStatus"]; conflicts?: ComponentProps<typeof GolfTripScoring>["conflicts"];
    onResolveConflict?: ComponentProps<typeof GolfTripScoring>["onResolveConflict"]; resetScoringCard?: ComponentProps<typeof GolfTripScoring>["resetCard"];
    /** Corrections (saved trips, Step 6). */
    corrections?: ComponentProps<typeof GolfTripScoring>["corrections"]; onRequestCorrection?: ComponentProps<typeof GolfTripScoring>["onRequestCorrection"];
    onDecideCorrection?: ComponentProps<typeof GolfTripScoring>["onDecideCorrection"] }) {
  const raw = useSyncExternalStore(subscribeNever, golfTripDraftSnapshot, () => "");
  const stored = useMemo(() => parseGolfTripDraft(raw), [raw]);
  const draft = preview ?? stored;
  const [selection, setSelection] = useState<{ navigation?: GolfTripNavigation; tab: Tab }>({ navigation, tab: navigation?.tab ?? "Home" });
  // A new external navigation request selects a tab; ordinary renders keep in-app navigation.
  if (selection.navigation !== navigation) setSelection({ navigation, tab: navigation?.tab ?? selection.tab });
  const tab = selection.navigation === navigation ? selection.tab : navigation?.tab ?? selection.tab;
  const setTab = (tab: Tab) => setSelection({ navigation, tab });
  // A Home box or the Venue's Itinerary tile opens the Itinerary tab.
  const openItinerary = () => setTab("Itinerary");
  // Trip travel lives in page state for now (dev mock trip): edits in My Info rebuild the itinerary and Home cards right
  // away, and reset on reload. A different seed (e.g. the simulator switching data) starts fresh.
  const [travelState, setTravelState] = useState({ seed: travelSeed, travel: travelSeed });
  if (travelState.seed !== travelSeed) setTravelState({ seed: travelSeed, travel: travelSeed });
  const travel = travelState.travel;
  // Golf rounds always show on the itinerary: my tee times, and "Tee time TBD" for rounds I'm not on a tee time for yet.
  const tripRounds = plannedRounds(draft).map(round => ({ number: round.number, date: round.date, course: draft[`round${round.number}Course`] || "Course TBD" }));
  const itinerary = travel || tripRounds.length ? withGolfRounds(travel ? itineraryFor(travel) : [], tripRounds) : undefined;
  // Play / Sit out: saved per trip (the dev data choice) under my name.
  const rsvpKey = competitionKey ?? "default";
  const myName = travel?.members.find(member => member.id === travel.meId)?.name || draft.yourName || "You";
  const changeMyTravel = (change: MyTravelChange) => setTravelState((current) => {
    if (!current.travel) return current;
    const next = change.type === "add" ? addMyItem(current.travel, change.item)
      : change.type === "update" ? updateMyItem(current.travel, change.id, change.changes)
      : removeMyItem(current.travel, change.id);
    onTravelChange?.(next);
    return { ...current, travel: next };
  });
  useEffect(() => {
    if (tab !== "Golf") onNavigationChange?.({ tab });
  }, [tab, onNavigationChange]);
  const competitive = draft.includesTournament === "yes";
  // Which competition the trip has, for the Golf tab's sections: none without a tournament; otherwise the organizer's
  // Individual / Team choices (dev Settings), or, until those are picked, the format (match play = team matches, stroke /
  // Stableford = individual leaderboard; unknown = both).
  const sharedCompetition = useGolfTripCompetitionPreview();
  const sharedType = sharedCompetition?.competitionTypes[competitionKey ?? "default"] ?? savedCompetitionType;
  // Team colors (Settings → Competition → Team Color): the match box and match list draw each team in its color — the
  // "UP" highlight, the win % and its bar. Left = Team A, right = Team B; unpicked teams keep the gold / rose defaults.
  const teamColorIds = sharedCompetition?.teamColors[competitionKey ?? "default"] ?? savedTeamColors ?? [];
  const teamColorVars = Object.fromEntries((["left", "right"] as const).flatMap((side, team) => {
    const color = teamColor(teamColorIds[team]);
    return color ? [[`--team-${side}`, color.base], [`--team-${side}-text`, color.text], [`--team-${side}-on-dark`, color.onDark]] : [];
  })) as CSSProperties;
  const scoring = previewMatch?.formatDef?.scoringMethod;
  const structure: CompetitionStructure = !competitive ? { individual: false, team: false }
    : sharedType ? { individual: Boolean(sharedType.individual), team: Boolean(sharedType.team) }
    : scoring === "match_play" ? { individual: false, team: true } : scoring ? { individual: true, team: false } : { individual: true, team: true };
  const [chatOpen, setChatOpen] = useState(false);
  const momentum = useTripMomentum(alertScope);
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
            <GolfTripNotifications scope={alertScope} />
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
      {tab === "Home" ? <><TripMomentumFeed events={momentum.events} loading={momentum.loading} error={momentum.error} onAlerts={() => setNotificationsOpen(true)} /><InfoAccount draft={draft} settingsHref={settingsHref} flights={flights} weather={weather} itinerary={itinerary} travel={travel} tripNow={tripNow} onOpenItinerary={openItinerary}
        rounds={plannedRounds(draft).map(round => ({ number: round.number, date: round.date, course: draft[`round${round.number}Course`] || "Course TBD", format: draft[`round${round.number}Format`] || (previewMatch && round.number === previewMatch.round ? previewMatch.formatDef?.label : undefined) }))}
        afterRound={previewMatch ? (roundLive || previewMatch.leaderboard.some(row => row.holes.every(strokes => strokes !== null)) ? previewMatch.round : previewMatch.round - 1) : 0}
        liveRound={roundLive && previewMatch ? { id: `round-${previewMatch.round}`, kind: "teeTime", title: `Round ${previewMatch.round} · ${previewMatch.course}`, startsAt: (tripNow ?? "").slice(0, 16) } : undefined} /></>
        : tab === "Golf" ? <>
          <div style={{ display: "contents", ...teamColorVars }}>
            <GolfSlides key={`${structure.individual}-${structure.team}`} previewMatch={previewMatch} structure={structure} rsvpKey={rsvpKey} navigation={navigation} onNavigationChange={onNavigationChange} tripStats={tripStats} scoreChanges={scoreChanges} />
          </div>
        </>
        : tab === "Venue" ? <GolfTripVenue draft={draft} settingsHref={settingsHref} today={tripNow?.slice(0, 10)}
          latitude={coordinate(draft.destinationLatitude)} longitude={coordinate(draft.destinationLongitude)}
          players={travel?.members.map(member => member.name) ?? []} items={itinerary ?? []} onOpenItinerary={openItinerary} />
        : tab === "Itinerary" ? <>
          {/* "+ Add" (the My Info add pop-ups) sits right under the Itinerary tab; then the day-by-day itinerary. */}
          {travel && <div className={styles.itineraryAddRow}><GolfTripAddTravel onChange={changeMyTravel} className={styles.itineraryAddPill} /></div>}
          <ItineraryList items={itinerary} tripDays={dates} today={tripNow?.slice(0, 10)} now={tripNow?.slice(0, 16)} rsvpKey={rsvpKey} myName={myName}
            whoFor={id => travel ? travel.participants.filter(p => p.itemId === id.split(":")[0] && p.status === "going").map(p => travel.members.find(m => m.id === p.memberId)?.name ?? "").filter(Boolean) : []} />
        </>
        : <Card title={tab}><Empty>Coming soon</Empty></Card>}
    </div>
    {roundLive && <GolfTripScoring key={`${scoringOwner ?? "me"}-${scoringPrefill ? `prefilled-${scoringPrefill.otherCardDiff ? "mismatch" : "match"}` : "blank"}`} prefill={scoringPrefill} onSubmit={onScoringSubmit} submittedCard={submittedCard} par={previewMatch?.par} initialHoles={yourHoles} courseName={previewMatch?.course} playerName={scoringPlayerName ?? (you ? getPlayerDisplayName(you) : draft.yourName || "You")} opponentCardMatches={opponentCardMatches}  attesteeName={attesteeName} edits={scoringEdits} onCardChange={onScoringCardChange} attestedStrokes={attestedStrokes} onAttestChange={onAttestChange} savedCard={savedScoringCard} attesteeStrokes={attesteeStrokes} scoresVerified={scoresVerified} syncStatus={syncStatus} conflicts={conflicts} onResolveConflict={onResolveConflict} resetCard={resetScoringCard} corrections={corrections} onRequestCorrection={onRequestCorrection} onDecideCorrection={onDecideCorrection} />}
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
function GolfSlides({ previewMatch, structure, rsvpKey = "default", navigation, onNavigationChange, tripStats, scoreChanges }: { previewMatch?: GolfMatchPreview; structure: CompetitionStructure; rsvpKey?: string; navigation?: GolfTripNavigation; onNavigationChange?: (navigation: GolfTripNavigation) => void; tripStats?: TripStatsView; scoreChanges?: ScoreChangeLine[] }) {
  // Competition is about the round being played: only that round's matches (matches without a round count as current).
  // The big box (Matches) shows the current round's matches one at a time: ‹ Match N › under it, or swipe the box
  // (left = next match, right = previous). Starts on match 1 again whenever the round changes.
  const roundMatch = useMemo(() => previewMatch && { ...previewMatch, matches: previewMatch.matches.filter(pairing => (pairing.round ?? previewMatch.round) === previewMatch.round) }, [previewMatch]);
  const matchCount = Math.max(1, roundMatch?.matches.length ?? 1);
  const [boxMatch, setBoxMatch] = useState({ round: previewMatch?.round ?? 1, index: 0 });
  if (previewMatch && boxMatch.round !== previewMatch.round) setBoxMatch({ round: previewMatch.round, index: 0 });
  const featured = Math.min(boxMatch.index, matchCount - 1);
  const boxSwipe = useSwipe(
    () => setBoxMatch(view => ({ ...view, index: Math.min(matchCount - 1, view.index + 1) })),
    () => setBoxMatch(view => ({ ...view, index: Math.max(0, view.index - 1) })));
  const trackRef = useRef<HTMLDivElement>(null);
  // No competition: Overview · Games. Individual: Leaderboard · Games. Team: Matches · Games. Both: Leaderboard · Matches · Games.
  // Player Stats on (Organizer → Player Scoring) adds Stats after Games.
  const playerStats = usePlayerStats();
  const sections = golfSections(structure, playerStats);
  // No competition: the Overview box is the day's round (course, tee times, who's playing — not those sitting out).
  const noComp = !structure.individual && !structure.team;
  // Individual only: the same box, split — the round on the left, the leaderboard's top 5 on the right.
  const individualOnly = structure.individual && !structure.team;
  // Team only: Overview's box is the round (tee times), and under it the tee sheet; Match keeps the matchups.
  const teamOnly = structure.team && !structure.individual;
  const rsvps = useRoundRsvps(rsvpKey);
  const roundRsvps = previewMatch ? rsvps[previewMatch.round] ?? {} : {};
  const sittingOut = new Set(Object.keys(roundRsvps).filter(name => roundRsvps[name] === "out"));
  // No competition: under the box, the day's scores best → worst when players score in the app; nothing when they don't.
  const inAppScoring = useInAppScoring();
  const availableSlides = sections.map(section => section.id);
  const requested = Math.max(0, availableSlides.findIndex(section => section === navigation?.golfSection));
  const [selection, setSelection] = useState({ navigation, active: requested });
  if (selection.navigation !== navigation) setSelection({ navigation, active: requested });
  const active = selection.navigation === navigation ? selection.active : requested;
  const setActive = (active: number) => setSelection({ navigation, active });
  // Games and Stats sit outside the swipe strip (like Games always has); the strip holds Leaderboard / Matches.
  const offStrip = (id: string | undefined) => id === "Games" || id === "Stats";
  const gamesActive = offStrip(availableSlides[active]);
  const statsActive = availableSlides[active] === "Stats";
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
    if (!offStrip(availableSlides[index])) requestAnimationFrame(() => {
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
        // Stats shows the tournament summary box, like Overview.
        const current = availableSlides[active] === "Stats" ? "Overview" : availableSlides[active] ?? "Overview";
        const shown = current === section;
        // Overview's box sets the size; Competition and Games fill exactly that box.
        return <div key={section} className={`${section === "Overview" ? styles.golfTopSize : styles.golfTopFill} ${shown ? "" : styles.golfTopHidden}`} inert={!shown}>
          {section === "Overview" ? noComp || individualOnly || teamOnly ? <GolfRoundInfo match={previewMatch} sittingOut={sittingOut} topFive={individualOnly} /> : <GolfTournamentSummary match={previewMatch} />
            : section === "Competition" ? <GolfMatchup match={roundMatch ?? previewMatch} compact swipe={boxSwipe} featured={featured}
              below={<MatchNav match={featured + 1} count={matchCount} onMatch={match => setBoxMatch(view => ({ ...view, index: match - 1 }))} />} /> : <GolfGamesSummary />}
        </div>;
      })}
    </div>}
    {/* Golf sections: the words themselves evenly spaced (equal gaps between them and at both ends), since their lengths differ. */}
    <div className={`${styles.tabs} ${styles.sectionTabs}`} role="tablist" aria-label="Golf sections">
      {sections.map(({ id, label }, i) => <button key={id} type="button" role="tab" aria-selected={active === i}
        className={`${styles.tab} ${active === i ? styles.tabActive : ""}`} onClick={() => goTo(i)}>{label}</button>)}
    </div>
    <div ref={trackRef} className={styles.slides} style={gamesActive ? { display: "none" } : undefined} onScroll={onScroll}>
      {sections.filter(({ id }) => !offStrip(id)).map(({ id: name, label }, i) => <div key={name} className={styles.slide} role="tabpanel" aria-label={label} inert={active !== i}>
        {name === "Overview"
          ? noComp && !inAppScoring ? null
          : teamOnly && previewMatch ? <GolfTeeSheet match={previewMatch} sittingOut={sittingOut} />
          : previewMatch ? <GolfTripLeaderboard match={previewMatch} byToday={noComp} /> : <Card title="Score Overview"><Empty>Your leaderboard and round scores will show here</Empty></Card>
          : previewMatch && roundMatch ? <GolfTripCompetitionMatchPreview key={previewMatch.round} initialMatch={previewMatch} /> : <Card title="Competition"><Empty>Your matchups will show here</Empty></Card>}
      </div>)}
    </div>
    <div role="tabpanel" aria-label="Games" hidden={!gamesActive || statsActive}>
      {previewMatch ? <GolfTripGames /> : <Card title="Games"><Empty>Golf games are coming soon</Empty></Card>}
    </div>
    {/* Stats (only while Player Stats is on): the trip's stats from the scorecards players have recorded. */}
    {sections.some(({ id }) => id === "Stats") && <div role="tabpanel" aria-label="Stats" hidden={!statsActive}>
      {tripStats ? <Card title="Trip stats"><GolfTripStats stats={tripStats} changes={scoreChanges} /></Card> : <Card title="Stats"><Empty>Stats will show here once players record rounds</Empty></Card>}
    </div>}
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
function ItineraryCard({ item, status, onOpen }: { item: ItineraryItem; status?: HomeStatus; onOpen: () => void }) {
  // A live golf round shows "Golf" and how far in; everything else its kind and when.
  const golf = status === "LIVE";
  const when = golf ? "In play now" : `${itineraryDay(item.startsAt)} · ${itineraryTime(item.startsAt)}`;
  const label = golf ? "Golf" : ITINERARY_KIND_LABEL[item.kind];
  return <button type="button" className={`${styles.accountCard} ${styles.itineraryCard}`} onClick={onOpen}
    aria-label={`${status ? `${status}: ` : ""}${label}: ${item.title}, ${when}${item.detail ? `, ${item.detail}` : ""}. Open the itinerary`}>
    <p className={`${styles.accountCardName} ${styles.cardHeadRow}`}>
      <span className={styles.cardKind}><TravelKindIcon kind={item.kind} size={14} /> {label}</span>
      {status && <span className={styles.statusTag} data-live={golf}>{status}</span>}
    </p>
    <p className={styles.accountCardAmount}>{item.title}</p>
    <p className={styles.accountCardNote}>{when}</p>
    {item.detail && <p className={styles.accountCardNote}>{item.detail}</p>}
  </button>;
}


/**
 * Info → Itinerary: one day at a time. A day selector (< weekday / date >) over a line, then that day's plans in time order.
 * Days run from the trip's first day (plus any earlier day with something on it) to its last; no < on the first, no > on the last.
 * Opens on today when today is one of the days.
 */
function ItineraryList({ items, tripDays, today: tripToday, whoFor, rsvpKey = "default", myName = "You", now: tripNowProp }: {
  items?: ItineraryItem[]; tripDays: string[]; today?: string; whoFor?: (itemId: string) => string[];
  /** Play / Sit out on golf rounds: which trip, and who I am. */
  rsvpKey?: string; myName?: string;
  /** Trip clock "YYYY-MM-DDTHH:mm" (dev); otherwise the device's time when the list opened. */
  now?: string;
}) {
  const rsvps = useRoundRsvps(rsvpKey);
  // Sit out asks first (it takes me out of any individual competition for that round).
  const [confirmSitOut, setConfirmSitOut] = useState<number | null>(null);
  const [deviceNow] = useState(() => localNow(new Date()));
  const nowStamp = tripNowProp ?? deviceNow;
  const days = itineraryByDay(items ?? [], tripDays);
  const [picked, setPicked] = useState<number | null>(null);
  // Tap a plan's box → its detail sheet slides up.
  const [openItem, setOpenItem] = useState<ItineraryItem | null>(null);
  const [todayIso] = useState(() => localNow(new Date()).slice(0, 10));
  // Arrows: the day slides away (50 ms), then the next one slides in from that side (50 ms) — 100 ms in all.
  const [slide, setSlide] = useState<{ to: number; dir: 1 | -1; stage: "out" | "in" } | null>(null);
  if (!days.length) return <Card title="Itinerary"><Empty>Nothing on the itinerary yet</Empty></Card>;
  const today = days.findIndex(({ day }) => day === (tripToday ?? todayIso));
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
      {dayItems.map((item, index) => {
        // Golf rounds: my Play / Sit out. Playing adds "Playing" bottom right; sitting out collapses the box to its top row.
        const round = item.round;
        const choice = round !== undefined ? rsvps[round]?.[myName] : undefined;
        // Play / Sit out can change until the round's tee times have started: my tee time, or (no tee time yet) the end of
        // the round's day.
        const locked = round !== undefined && nowStamp >= (item.timeTbd ? `${item.startsAt.slice(0, 10)}T23:59` : item.startsAt.slice(0, 16));
        return <div key={item.id} className={styles.itineraryEntry}>
        {/* The type sits above its box in cream, left-aligned, over a line — once for a run of the same type back to back. */}
        {(index === 0 || itineraryCategory(dayItems[index - 1]) !== itineraryCategory(item)) && <h3 className={styles.itineraryType}>{itineraryCategory(item)}</h3>}
        <div className={styles.itineraryBoxWrap}>
          <button type="button" className={styles.itineraryBox} data-round={round !== undefined} data-rsvp={choice} aria-haspopup="dialog" aria-label={`${itineraryCategory(item)}: ${item.title}, ${item.timeTbd ? "tee time to be decided" : itineraryTime(item.startsAt)}${choice === "in" ? ", playing" : choice === "out" ? ", sitting out" : ""}`} onClick={() => setOpenItem(item)}>
            <div className={styles.itineraryBoxTop}>
              <span className={styles.itineraryBoxTime}>{item.timeTbd ? "Tee time TBD" : itineraryTime(item.startsAt)}</span>
            </div>
            {choice !== "out" && <>
              <span className={styles.itineraryBoxTitle}>{item.title}</span>
              {item.detail && <span className={styles.itineraryBoxTime}>{item.detail}</span>}
            </>}
            {choice === "in" && <span className={styles.itineraryPlaying}>Playing</span>}
          </button>
          {/* Sit out (red), then Play (green), side by side in the box's top row, level with the tee time; the organizer sees
              the choice when picking tee-time players. */}
          {round !== undefined && <div className={styles.rsvpButtons} role="group" aria-label={`Round ${round}: play or sit out`}>
            <button type="button" className={styles.rsvpSit} aria-pressed={choice === "out"} disabled={locked} onClick={() => { if (choice !== "out") setConfirmSitOut(round); }}>Sit out</button>
            <button type="button" className={styles.rsvpPlay} aria-pressed={choice === "in"} disabled={locked} onClick={() => setRoundRsvp(rsvpKey, round, myName, "in")}>Play</button>
          </div>}
        </div>
      </div>;
      })}
      </div>
    </section>
    {openItem && <ItineraryDetailSheet item={openItem} going={whoFor?.(openItem.id) ?? []} onClose={() => setOpenItem(null)} />}
    {confirmSitOut !== null && <div className={styles.deleteOverlay} role="dialog" aria-modal="true" aria-label="Sit out confirmation">
      <div className={styles.deleteDialog}>
        <p className={styles.deletePrompt}>Sitting out of this round will remove you from any individual competition.</p>
        <button type="button" className={styles.cancelButton} onClick={() => setConfirmSitOut(null)}>Go back</button>
        <button type="button" className={styles.deleteButton} onClick={() => { setRoundRsvp(rsvpKey, confirmSitOut, myName, "out"); setConfirmSitOut(null); }}>Sit Out</button>
      </div>
    </div>}
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
function InfoAccount({ draft, settingsHref, flights, weather, itinerary, travel, tripNow, liveRound, rounds, afterRound, onOpenItinerary }: {
  draft: GolfTripDraft; settingsHref: string; flights?: TripFlights; weather?: Promise<TripWeather>; itinerary?: ItineraryItem[]; travel?: TripTravel; tripNow?: string;
  /** The golf round being played right now (its Scoring sheet is up): the only thing marked LIVE. */
  liveRound?: ItineraryItem; onOpenItinerary: () => void;
  /** For the Mom section's next-round reminder. */
  rounds?: MomRound[]; afterRound?: number;
}) {
  const destination = draft.destination;
  const tripDateRange = dateRangeLabel(draft.startDate, draft.endDate);
  // Two boxes with a status top right: LIVE (a golf round in play) or NOW (anything else happening), then NEXT; with nothing
  // happening, NEXT then UPCOMING. "now" is read once, when Home opens (or comes from the dev trip clock).
  const [deviceNow] = useState(() => localNow(new Date()));
  const now = tripNow?.slice(0, 16) ?? deviceNow;
  const boxes = itinerary ? homeBoxes(itinerary, now, liveRound) : [];
  return <div className={styles.account}>
    {/* Maroon head: the heading + weather, then the Mom section; the boxes below overlap its bottom edge. */}
    <div className={styles.accountHead}>
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
    {/* Mom: my live notifications, or a countdown to arrival day when there are none (between the heading and the boxes). */}
    <div className={styles.momSlot}><MomSection travel={travel} arrivalDay={draft.startDate} plans={itinerary ?? []} startAt={tripNow} rounds={rounds} afterRound={afterRound} /></div>
    </div>
    {/* Two boxes, one over the other, 5% in from each side: LIVE / NOW then NEXT, or NEXT then UPCOMING (status top right).
        Tap one to open Info → Itinerary. Trips without an itinerary keep the Flights card. */}
    <div className={styles.liveBoxes}>
      {itinerary
        ? boxes.length
          ? boxes.map(({ status, item }) => <ItineraryCard key={item.id} status={status} item={item} onOpen={onOpenItinerary} />)
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
