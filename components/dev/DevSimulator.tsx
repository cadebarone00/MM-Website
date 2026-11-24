"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, MonitorSmartphone, RotateCcw, Shuffle, SlidersHorizontal } from "lucide-react";
import { LEGACY_SIMULATOR_GROUPS, SIMULATOR_FEATURES, SIMULATOR_STAGES, type SimulatorStage, DEFAULT_SIMULATOR_STATE, parseGpsState, parseSimulatorLocation, syncSimulatorNavigation, simulatorPageForLocation, SIMULATOR_CHANNEL, SIMULATOR_DEVICES, SIMULATOR_VIEWS, simulatorViewDevices, liveSurfaceForView, type SimulatorView, type SimulatorConfig, type SimulatorGpsCommand, type SimulatorGpsState, type SimulatorPage, type SimulatorSource, type SimulatorState } from "@/lib/dev/simulator";
import { applySimulatorSafeAreas } from "./simulatorSafeAreas";
import { resetJustCreated } from "@/lib/dev/justCreatedStore";
import { devTripScope, initializeTripScenario, resetDevSetup } from "@/lib/dev/tripSetupStore";
import { TripScenarioControls } from "./TripScenarioControls";
import { HighlightScenarioControls } from "./HighlightScenarioControls";
import { normalizeTripScenario } from "@/lib/dev/tripScenario";
import { HapticsVisualizer } from "./HapticsVisualizer";
import { DesignReview } from "./DesignReview";
import { applyMode, appMode, type AppMode } from "@/lib/theme/appMode";
import { lightTap } from "@/lib/haptics";
import { DRAFT_SIM_DEFAULTS } from "@/lib/dev/draftSim";
import { MockDraftPanel } from "./MockDraftPanel";
import { MockMatchPanel } from "./MockMatchPanel";
import styles from "./DevSimulator.module.css";
import { ROUND_SAMPLE_DEFAULTS } from "@/lib/dev/sampleRoundGames";

/** Play → Games mid round and Golf Trip → Games sample: what each choice is before it's picked, so its card shows pressed. */
const ROUND_PRESSED_DEFAULTS: Record<string, unknown> = {
  roundThru: ROUND_SAMPLE_DEFAULTS.thru, roundNet: ROUND_SAMPLE_DEFAULTS.net, roundBirdies: ROUND_SAMPLE_DEFAULTS.birdies, roundMoney: ROUND_SAMPLE_DEFAULTS.money,
  roundDoubled: ROUND_SAMPLE_DEFAULTS.doubled, roundCarry: ROUND_SAMPLE_DEFAULTS.carryovers, roundPress: ROUND_SAMPLE_DEFAULTS.autoPress, roundSide: ROUND_SAMPLE_DEFAULTS.sideGames,
  roundViewer: ROUND_SAMPLE_DEFAULTS.viewer, sampleGamesStarted: true,
};

const initialDevice = SIMULATOR_DEVICES[4];
const bounded = (value: string, min: number, max: number, fallback: number) => value === "" || !Number.isFinite(Number(value)) ? fallback : Math.max(min, Math.min(max, Math.round(Number(value))));
/** Same-origin pages load by path; a page served by another local dev server (page.origin) loads from there. */
const frameUrl = (page: SimulatorPage) => `${page.origin ?? ""}${page.path}`;
/** A page's address plus simulator parameters, joined with "?" or "&" (some pages already carry a query, e.g. /dev/tv?show=match). */
const withParams = (url: string, params: string) => `${url}${url.includes("?") ? "&" : "?"}${params}`;

/** The dev group whose screens draw an App / Mobile website / Desktop version, picked by the Device section's View. */
const LIVE_GROUP = "The Maroon Live";
/** "&surface=..." for The Maroon Live's standalone pages (TV mode reads it from its address), plus TV mode's stage and
 *  event kind Conditionals ("&phase=…&kind=…"); nothing for other pages. */
const liveParam = (page: SimulatorPage, view: SimulatorView, state: SimulatorState) => page.group === LIVE_GROUP && page.standalone
  ? `&surface=${liveSurfaceForView(view)}${isTvPage(page) ? `&phase=${state.tvPhase ?? "live"}&kind=${state.tvKind ?? "trip"}&teams=${state.tvTeams ?? "two"}&group=${state.tvGroup ?? "2"}` : ""}` : "";
/** The Website group: web pages only, so never the app's status-bar space. */
const WEBSITE_GROUP = "Website";
/** TV mode boards only exist as a TV screen: opening one switches the View to TV. */
const isTvPage = (page: SimulatorPage) => page.path.startsWith("/dev/tv");
/** The preset a view opens on: the last phone / CarPlay screen picked, else the view's only preset. */
const viewDevice = (view: SimulatorView, phone: string, car: string) => view === "app" || view === "mobileweb" ? phone : view === "carplay" ? car : simulatorViewDevices(view)[0];

const FEATURES: readonly string[] = SIMULATOR_FEATURES;

export function DevSimulator({ pages: registryPages, unmapped, initialGroup, initialStage }: { pages: SimulatorPage[]; unmapped: Record<string, unknown>; initialGroup?: string; initialStage?: string }) {
  const [settingsRounds, setSettingsRounds] = useState<{ id: string; number: number }[]>([]);
  const pages = useMemo(() => [...registryPages, ...settingsRounds.map(round => ({ ...registryPages.find(page => page.id === "settings-competition-rounds")!, id: `settings-round-${round.id}`, label: `Round ${round.number}`, parentId: "settings-competition-rounds", navigation: { tab: "Home" as const, settingsView: `round-${round.id}` } }))], [registryPages, settingsRounds]);
  // ?group=…&stage=… (an old group name like "Golf Trip Active" opens the feature + stage it moved to; the old
  // "Website desktop" / "Website mobile" groups open the Website group at that size).
  const legacyWebsite = initialGroup === "Website desktop" || initialGroup === "Website mobile";
  const [startGroup, startStage] = legacyWebsite ? [WEBSITE_GROUP, undefined] : initialGroup && LEGACY_SIMULATOR_GROUPS[initialGroup] ? LEGACY_SIMULATOR_GROUPS[initialGroup] : [initialGroup, SIMULATOR_STAGES.find(item => item === initialStage)];
  const initialPage = (startGroup && FEATURES.includes(startGroup) ? pages.find(page => page.group === startGroup && (page.stage ?? "Main") === (startStage ?? "Main") && !page.parentId) : undefined)
    ?? pages.find(page => page.group === startGroup) ?? pages.find(page => page.path === "/dev/tournament") ?? pages[0];
  // Feature groups: the Main · Active · Onboarding switch. Picked by hand only when that stage has no pages yet; otherwise it follows the page.
  const [stageChoice, setStageChoice] = useState<SimulatorStage | null>(startGroup && FEATURES.includes(startGroup) && startStage && initialPage.stage !== startStage ? startStage : null);
  // The Device section's View (App · Mobile website · Desktop · TV · CarPlay · Apple Watch). It stays when the page changes.
  const initialView: SimulatorView = isTvPage(initialPage) ? "tv" : initialPage.group === WEBSITE_GROUP ? (initialGroup === "Website mobile" ? "mobileweb" : "desktop") : "app";
  const [view, setView] = useState<SimulatorView>(initialView);
  const lastPhone = useRef<string>(initialDevice.id);
  const lastCar = useRef<string>("carplay");
  // The view picked before a TV mode board switched to TV; it comes back when leaving TV mode.
  const viewBeforeTv = useRef<SimulatorView | null>(null);
  const initialPreset = SIMULATOR_DEVICES.find(item => item.id === viewDevice(initialView, initialDevice.id, "carplay"))!;
  const [pageId, setPageId] = useState(initialPage.id);
  const [frameSrc, setFrameSrc] = useState(withParams(frameUrl(initialPage), `simulator=1${liveParam(initialPage, initialView, { ...DEFAULT_SIMULATOR_STATE, ...initialPage.state })}`));
  const [currentPath, setCurrentPath] = useState(initialPage.path);
  const [device, setDevice] = useState<string>(initialPreset.id);
  const [size, setSize] = useState({ width: initialPreset.width as number, height: initialPreset.height as number });
  const [sizeText, setSizeText] = useState({ width: String(initialPreset.width), height: String(initialPreset.height) });
  const appInsets = initialView === "app" && !initialPage.standalone && initialPage.group !== WEBSITE_GROUP;
  const [insets, setInsets] = useState({ top: appInsets ? initialPreset.top as number : 0, bottom: appInsets ? initialPreset.bottom as number : 0 });
  const [showSafeAreas, setShowSafeAreas] = useState(false);
  const [showKeyboard, setShowKeyboard] = useState(true);
  const [zoom, setZoom] = useState("fit");
  const [available, setAvailable] = useState({ width: 700, height: 850 });
  const [source, setSource] = useState<SimulatorSource>("maroon");
  const [state, setState] = useState<SimulatorState>({ ...DEFAULT_SIMULATOR_STATE, ...initialPage.state });
  const [navigation, setNavigation] = useState(initialPage.navigation);
  const [ready, setReady] = useState(false);
  const [hapticLevel, setHapticLevel] = useState(2);
  const [hapticDuration, setHapticDuration] = useState(1000);
  // GPS test: the open GPS screen's state (null when the phone isn't showing one).
  const [gps, setGps] = useState<SimulatorGpsState | null>(null);
  const iframe = useRef<HTMLIFrameElement>(null);
  const [appearance, setAppearance] = useState<AppMode>("dark");
  const appearanceObserver = useRef<MutationObserver | null>(null);
  useEffect(() => { setAppearance(appMode(document.documentElement.getAttribute("data-mode"))); return () => appearanceObserver.current?.disconnect(); }, []);
  const setSimulatorAppearance = (mode: AppMode) => {
    applyMode(mode); setAppearance(mode);
    try { const root = iframe.current?.contentDocument?.documentElement; if (root) { if (mode === "light") root.setAttribute("data-mode", "light"); else root.removeAttribute("data-mode"); } } catch { /* Other-origin previews cannot be controlled. */ }
  };
  const observeAppearance = () => {
    appearanceObserver.current?.disconnect();
    try { const root = iframe.current?.contentDocument?.documentElement; if (!root) return; setAppearance(appMode(root.getAttribute("data-mode"))); const observer = new MutationObserver(() => setAppearance(appMode(root.getAttribute("data-mode")))); observer.observe(root, { attributes: true, attributeFilter: ["data-mode"] }); appearanceObserver.current = observer; } catch { /* Other-origin previews cannot be inspected. */ }
  };
  const [screen, setScreen] = useState<HTMLDivElement | null>(null);
  const stage = useRef<HTMLDivElement>(null);
  const caption = useRef<HTMLDivElement>(null);
  const command = useRef(0);
  const bridgeReady = useRef(false);
  // The phone keyboard (2026-11-20): iOS for the iPhone presets, Android for the Pixel ones; the side panel can hide it.
  // Only the phone views (App, Mobile website) have the on-screen phone keyboard.
  const watch = device === "applewatch";
  const dash = device === "carplaydashtop" || device === "carplaydashbottom";
  const car = device === "carplay" || dash;
  const keyboard: "ios" | "android" | "off" = !showKeyboard || (view !== "app" && view !== "mobileweb") ? "off" : device.startsWith("pixel") ? "android" : "ios";
  // CarPlay: the pretend side bar (80 px), plus the Dashboard's pretend map (414 px + 6 px gap), sit beside our app.
  // Dashboard: our app is one half of the right column; a pretend Now Playing card (+ 6 px gap) is the other half.
  const carExtra = device === "carplay" ? 80 : dash ? 500 : 0;
  const frameWidth = size.width + carExtra + 16;
  const frameHeight = (dash ? size.height * 2 + 6 : size.height) + 16;
  const screenRadius = watch ? 42 : car ? 8 : undefined;
  // The Maroon Live screens draw the version that matches the View.
  const config = useMemo<SimulatorConfig>(() => ({ source, state: { ...state, keyboard, liveSurface: liveSurfaceForView(view) }, navigation }), [source, state, navigation, keyboard, view]);
  const selectedPage = pages.find(page => page.id === pageId) ?? { ...initialPage, label: `Current route · ${currentPath}` };
  // A page from another local dev server: if that server isn't running, the phone says how to start it (not an error page).
  const [downOrigin, setDownOrigin] = useState<string | null>(null);
  const [originCheck, setOriginCheck] = useState(0);
  useEffect(() => {
    const origin = selectedPage.origin;
    if (!origin) return;
    let live = true;
    // no-cors: any answer at all means the server is up; only a refused connection rejects.
    fetch(`${origin}/favicon.ico`, { mode: "no-cors", cache: "no-store" }).then(() => { if (live) setDownOrigin(null); }, () => { if (live) setDownOrigin(origin); });
    return () => { live = false; };
  }, [selectedPage.origin, originCheck]);
  const desktopPreview = size.width >= 1024;
  const websitePreview = selectedPage.group === WEBSITE_GROUP;
  // The second Device choice: phones (App / Mobile website) or CarPlay screens; one-preset views have none.
  const viewOptions = simulatorViewDevices(view);
  const isBrandIntro = currentPath === "/dev/brand/intro";
  const supportsFixtures = currentPath.startsWith("/dev/tournament");
  const scenarioVisible = supportsFixtures && (source === "mock" || source === "busy");
  // Home → Team Draft → Mock draft (test run): the test panel sits just left of the phone.
  const mockDraftPreset = selectedPage.id === "home-team-draft-mock" && state.mockDraft && state.mockDraft !== "off" ? state.mockDraft : null;
  const mockMatchPreset = selectedPage.id === "home-match-selection-mock" && state.mockMatch && state.mockMatch !== "off" ? state.mockMatch : null;
  const conditions = scenarioVisible ? selectedPage.conditions?.filter(condition=>!condition.playerCount && !["competition-source","competitive","social","round-source","scheduled","round-live","round-end-match","round-end-mismatch","round-between","round-complete","dual-draft-momentum","home-draft-configured"].includes(condition.id) && !["home-match-draft-","match-draft-","format-"].some(prefix=>condition.id.startsWith(prefix))) : selectedPage.conditions;
  const groups = Array.from(new Set(pages.map(page => page.group ?? "Other")));
  const selectedGroup = selectedPage.group ?? "Other";
  const isFeature = FEATURES.includes(selectedGroup);
  const shownStage: SimulatorStage = stageChoice ?? selectedPage.stage ?? "Main";
  const groupPages = pages.filter(page => (page.group ?? "Other") === selectedGroup && !page.parentId && (!isFeature || (page.stage ?? "Main") === shownStage));
  function chooseStage(next: SimulatorStage) {
    const first = pages.find(page => page.group === selectedGroup && (page.stage ?? "Main") === next && !page.parentId);
    if (first) choosePage(first.id);
    else {
      setStageChoice(next);
      const url = new URL(window.location.href);
      url.searchParams.set("stage", next);
      window.history.replaceState(null, "", url);
    }
  }
  const branchPath: SimulatorPage[] = [];
  let branchPage: SimulatorPage | undefined = selectedPage;
  while (branchPage) {
    branchPath.unshift(branchPage);
    branchPage = pages.find(page => page.id === branchPage?.parentId);
  }
  const branchColumns = branchPath.filter(page => pages.some(child => child.parentId === page.id));
  const activeIds = new Set(branchPath.map(page => page.id));
  const conditionalColumn = useRef<HTMLElement>(null);
  useEffect(() => {
    if (selectedPage.parentId || branchColumns.length) {
      const workspace = conditionalColumn.current?.closest("main");
      workspace?.scrollTo({ left: workspace.scrollWidth - workspace.clientWidth, behavior: "smooth" });
    }
  }, [pageId, selectedPage.parentId, branchColumns.length]);
  const preset = SIMULATOR_DEVICES.find(item => item.id === device)!;
  // Fit may enlarge the visual frame. The iframe itself keeps its CSS viewport.
  const scale = zoom === "fit" ? Math.max(0.01, Math.min(Math.max(1, available.width - 184) / frameWidth, available.height / frameHeight)) : Number(zoom);

  const sendConfig = useCallback(() => {
    iframe.current?.contentWindow?.postMessage({ channel: SIMULATOR_CHANNEL, type: "config", config, routes: pages.map(page => page.path) }, window.location.origin);
  }, [config, pages]);

  useEffect(() => {
    const target = stage.current;
    if (!target) return;
    const measure = () => {
      const padding = getComputedStyle(target);
      const captionStyle = caption.current ? getComputedStyle(caption.current) : null;
      const captionInFlow = captionStyle?.position !== "absolute";
      const captionHeight = captionInFlow ? caption.current?.offsetHeight ?? 0 : 0;
      const captionMargin = captionInFlow && captionStyle ? parseFloat(captionStyle.marginTop) || 0 : 0;
      const measured = {
        width: target.clientWidth - (parseFloat(padding.paddingLeft) || 0) - (parseFloat(padding.paddingRight) || 0),
        height: target.clientHeight - (parseFloat(padding.paddingTop) || 0) - (parseFloat(padding.paddingBottom) || 0) - captionHeight - captionMargin,
      };
      // A transient unresolved style/zero-size frame during HMR must not poison Fit.
      if (Object.values(measured).every(value => Number.isFinite(value) && value > 0)) setAvailable(measured);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(target);
    if (caption.current) observer.observe(caption.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    function receive(event: MessageEvent) {
      if (pages.find(page => page.id === pageId)?.standalone) return;
      if (event.origin !== window.location.origin || event.source !== iframe.current?.contentWindow || event.data?.channel !== SIMULATOR_CHANNEL || !["ready", "location"].includes(event.data.type)) return;
      const location = parseSimulatorLocation(event.data.location);
      if (!location) return;
      const rounds = event.data.location?.rounds;
      if (location.path === "/dev/tournament/settings" && Array.isArray(rounds) && rounds.length <= 100 && rounds.every(round => round && typeof round.id === "string" && /^[a-z0-9-]{1,80}$/.test(round.id) && Number.isInteger(round.number) && round.number > 0)) {
        setSettingsRounds(current => JSON.stringify(current) === JSON.stringify(rounds) ? current : rounds.map(({ id, number }: { id: string; number: number }) => ({ id, number })));
      }
      setNavigation(current => syncSimulatorNavigation(current, location.navigation));
      setCurrentPath(location.path);
      setPageId(current => simulatorPageForLocation(pages, location, current)?.id ?? "");
      if (event.data.type === "ready") {
        setGps(null); // a fresh page; a GPS screen on it reports itself again
        bridgeReady.current = true;
        setReady(true);
        sendConfig();
      }
    }
    window.addEventListener("message", receive);
    sendConfig();
    return () => window.removeEventListener("message", receive);
  }, [sendConfig, pages, pageId]);

  // GPS test: the phone's GPS screen reports its mode and accuracy (or null when it closes).
  useEffect(() => {
    function receive(event: MessageEvent) {
      if (event.origin !== window.location.origin || event.source !== iframe.current?.contentWindow || event.data?.channel !== SIMULATOR_CHANNEL || event.data.type !== "gps-state") return;
      setGps(event.data.state === null ? null : parseGpsState(event.data.state));
    }
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, []);
  const sendGps = (command: SimulatorGpsCommand) => iframe.current?.contentWindow?.postMessage({ channel: SIMULATOR_CHANNEL, type: "gps-command", command }, window.location.origin);

  // Safe-area updates are event-driven too: document loads, route reports and HMR styles.
  useEffect(() => {
    const frame = iframe.current;
    if (!frame) return;
    let observer: MutationObserver | undefined;
    const bind = () => {
      observer?.disconnect();
      try {
        const document = frame.contentDocument;
        if (!document?.head) return;
        const update = () => applySimulatorSafeAreas(document, insets.top, insets.bottom);
        update();
        observer = new MutationObserver(update);
        observer.observe(document.head, { childList: true, subtree: true, characterData: true });
      } catch { /* External destinations are outside this same-origin simulator. */ }
    };
    bind();
    frame.addEventListener("load", bind);
    return () => { observer?.disconnect(); frame.removeEventListener("load", bind); };
  }, [insets, currentPath]);

  function choosePage(id: string) {
    const next = pages.find(page => page.id === id);
    if (!next) return;
    const url = new URL(window.location.href);
    url.searchParams.set("group", next.group ?? "Other");
    if (FEATURES.includes(next.group ?? "")) url.searchParams.set("stage", next.stage ?? "Main"); else url.searchParams.delete("stage");
    window.history.replaceState(null, "", url);
    setStageChoice(null);
    if (next.state) setState(current => ({ ...current, ...next.state }));
    // The View stays; a TV mode board switches to TV, and leaving TV mode puts back the view picked before it.
    let nextView = view;
    if (isTvPage(next) && view !== "tv") { viewBeforeTv.current = view; nextView = "tv"; }
    else if (!isTvPage(next) && view === "tv" && viewBeforeTv.current) { nextView = viewBeforeTv.current; viewBeforeTv.current = null; }
    // Re-fit the screen when the view changes, or entering / leaving pages with no app status bar (Website, standalone).
    const plain = (page: SimulatorPage) => page.group === WEBSITE_GROUP || !!page.standalone;
    if (nextView !== view || plain(next) || plain(selectedPage)) applyView(nextView, nextView === view ? device : viewDevice(nextView, lastPhone.current, lastCar.current), next, false);
    setPageId(id);
    const requested = next.navigation ? { ...next.navigation, command: ++command.current } : undefined;
    setNavigation(requested);
    // These canvases intentionally have no simulator bridge. Always replace their
    // document, including desktop/mobile entries that share the same route. Pages
    // served by another local dev server (origin) can't hear the bridge either.
    if (next.standalone || selectedPage.standalone || next.origin || selectedPage.origin) {
      bridgeReady.current = false;
      setReady(false);
      setGps(null);
      setCurrentPath(next.path);
      setFrameSrc(withParams(frameUrl(next), `simulator=1${liveParam(next, nextView, state)}&command=${++command.current}`));
      return;
    }
    let path = currentPath;
    try { path = iframe.current?.contentWindow?.location.pathname ?? path; } catch { bridgeReady.current = false; }
    if (bridgeReady.current) {
      // Apply the request before navigating so the next screen receives current fixtures/tab.
      iframe.current?.contentWindow?.postMessage({ channel: SIMULATOR_CHANNEL, type: "config", config: { ...config, navigation: requested }, routes: pages.map(page => page.path) }, window.location.origin);
      if (path !== next.path) iframe.current?.contentWindow?.postMessage({ channel: SIMULATOR_CHANNEL, type: "navigate", path: next.path }, window.location.origin);
    } else if (path !== next.path) {
      setReady(false);
      setFrameSrc(withParams(frameUrl(next), `simulator=1&command=${++command.current}`));
    }
  }
  function chooseDevice(id: string) {
    const next = SIMULATOR_DEVICES.find(item => item.id === id)!;
    setDevice(id);
    if (id !== "custom") {
      setSize({ width: next.width, height: next.height });
      setSizeText({ width: String(next.width), height: String(next.height) });
      setInsets({ top: next.top, bottom: next.bottom });
    }
  }
  /** The Device section: a View (and its phone / CarPlay screen). Only App keeps the phone's status-bar space, and never
   *  on Website or standalone pages. `reload`: Website and standalone pages (TV mode) have no simulator bridge, so they
   *  load again at the new size / version. */
  function applyView(nextView: SimulatorView, id: string, page: SimulatorPage = selectedPage, reload = true) {
    setView(nextView);
    chooseDevice(id);
    if (nextView === "app" || nextView === "mobileweb") { if (id !== "custom") lastPhone.current = id; }
    if (nextView === "carplay") lastCar.current = id;
    if (nextView !== "app" || page.group === WEBSITE_GROUP || page.standalone) setInsets({ top: 0, bottom: 0 });
    if (reload && (page.group === WEBSITE_GROUP || page.standalone)) {
      setReady(false);
      setFrameSrc(withParams(frameUrl(page), `simulator=1${liveParam(page, nextView, state)}&command=${++command.current}`));
    }
  }
  function chooseSource(next:SimulatorSource){
    if(next===source)return;
    setSource(next);
    setState(next==="mock"||next==="busy"?normalizeTripScenario({...DEFAULT_SIMULATOR_STATE,tripLength:4,tripMoment:"during",tripDay:1,tripRoundsPerDay:1,tripRoundSlot:1,playerCount:next==="busy"?32:8,competition:"yes",competitionSetup:"both",draftProgress:"ready",roundStatus:"live"}):DEFAULT_SIMULATOR_STATE);
  }
  function updateState(id: string, value: string) {
    setState(current => ({ ...current, [id]: id === "playerCount" ? value === "" ? null : bounded(value, 1, 64, 8) : value }));
  }
  function editSize(edge: "width" | "height", value: string, commit = false) {
    const min = 160;
    const max = edge === "width" ? 2000 : 1800;
    const parsed = Number(value);
    if (!commit || bounded(value, min, max, size[edge]) !== size[edge]) setDevice("custom");
    setSizeText(current => ({ ...current, [edge]: commit ? String(bounded(value, min, max, size[edge])) : value }));
    if (commit || (value !== "" && Number.isInteger(parsed) && parsed >= min && parsed <= max)) {
      setSize(current => ({ ...current, [edge]: bounded(value, min, max, current[edge]) }));
    }
  }

  return <main className={styles.shell} style={{ "--phone-aspect": frameWidth / frameHeight, "--phone-display-width": zoom === "fit" ? "0px" : `${frameWidth * Number(zoom)}px`, ...(desktopPreview ? { "--preview-min-width": "720px" } : {}) } as CSSProperties}>
    <header className={styles.header}>
      <div className={styles.brand}><MonitorSmartphone size={22} /><div><h1>App simulator</h1><p>The Maroon · Development workspace</p></div></div>
      <div className={styles.appearanceToggle} role="group" aria-label="App appearance">{(["light", "dark"] as const).map(mode => <button key={mode} type="button" aria-pressed={appearance === mode} onClick={() => setSimulatorAppearance(mode)}>{mode === "light" ? "Light mode" : "Dark mode"}</button>)}</div>
      <div className={styles.headerStatus}><span className={styles.headerDevice}>{view === "app" || view === "mobileweb" ? `${SIMULATOR_VIEWS.find(([id]) => id === view)![1]} · ${preset.label}` : preset.label}</span><span className={styles.devBadge}><span /> LOCAL DEV</span></div>
    </header>
    <div className={styles.workspace} style={{ gridTemplateColumns: `var(--groups-width) var(--pages-width) ${branchColumns.map(() => "var(--pages-width)").join(" ")} var(--conditions-width) ${scenarioVisible ? "var(--conditions-width) " : ""}${mockDraftPreset || mockMatchPreset ? "320px " : ""}minmax(var(--preview-min-width),1fr) 230px` }}>
      <aside className={styles.controls} aria-label="Development controls">
        <div className={styles.panelHeading}><SlidersHorizontal size={16} /> Groups</div>
        <form className={styles.cards} action="/dev" method="get">{groups.map((group, index) => <Fragment key={group}>{index > 0 && !FEATURES.includes(group) && FEATURES.includes(groups[index - 1]) && <h3 className={styles.conditionSection}>Other</h3>}<button className={styles.card} type="submit" name="group" value={group} key={group} aria-pressed={selectedGroup === group} onClick={event => { event.preventDefault(); choosePage((pages.find(page => page.group === group && (page.stage ?? "Main") === "Main" && !page.parentId) ?? pages.find(page => (page.group ?? "Other") === group))!.id); }}>{group}</button></Fragment>)}</form>
        <section className={styles.controlSection} aria-labelledby="device-heading">
          <h2 id="device-heading">Device</h2>
          <label>View<select aria-label="Device view" value={view} onChange={event => { const next = event.target.value as SimulatorView; applyView(next, viewDevice(next, lastPhone.current, lastCar.current)); }}>{SIMULATOR_VIEWS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
          {/* Phones for App / Mobile website; Full screen / Dashboard top / bottom card for CarPlay. */}
          {viewOptions.length > 1 && <label>{view === "carplay" ? "Screen" : "Phone"}<select aria-label={view === "carplay" ? "CarPlay screen" : "Phone"} value={device} onChange={event => applyView(view, event.target.value)}>
            {device === "custom" && <option value="custom">Custom size</option>}
            {viewOptions.map(id => <option key={id} value={id}>{SIMULATOR_DEVICES.find(item => item.id === id)!.label.replace(/^CarPlay · /, "")}</option>)}</select></label>}
          <div className={styles.pair}>
            {(["width", "height"] as const).map(edge => <label key={edge}>{edge === "width" ? "Width" : "Height"}<div className={styles.unitInput}><input type="number" aria-label={`Viewport ${edge}`} min={160} max={edge === "width" ? 2000 : 1800} value={sizeText[edge]} onChange={event => editSize(edge, event.target.value)} onBlur={event => editSize(edge, event.target.value, true)} /><span>px</span></div></label>)}
          </div>
          <label>Display scale<select aria-label="Display scale" value={zoom} onChange={event => setZoom(event.target.value)}><option value="fit">Fit to workspace</option><option value="1">100%</option><option value="0.75">75%</option><option value="0.5">50%</option></select></label>
          <label className={styles.checkbox}><input type="checkbox" checked={showKeyboard} onChange={event => setShowKeyboard(event.target.checked)} />Show phone keyboard when typing</label>
          <details className={styles.advanced}><summary>Safe-area testing</summary><div className={styles.pair}>{(["top", "bottom"] as const).map(edge => <label key={edge}>{edge === "top" ? "Top inset" : "Bottom inset"}<input type="number" aria-label={`Safe-area ${edge}`} min={0} max={100} value={insets[edge]} onChange={event => setInsets(current => ({ ...current, [edge]: bounded(event.target.value, 0, 100, 0) }))} /></label>)}</div><label className={styles.checkbox}><input type="checkbox" checked={showSafeAreas} onChange={event => setShowSafeAreas(event.target.checked)} />Show inset guides</label><p>Editable insets exercise existing safe-area CSS. Display scale keeps the CSS viewport unchanged.</p></details>
        </section>
        {supportsFixtures && source === "maroon" && <details className={styles.inspector}><summary>Unmapped Tournament Data</summary><pre>{JSON.stringify(unmapped, null, 2)}</pre></details>}
      </aside>
      <aside className={styles.controls} aria-label="Pages">
        <div className={styles.panelHeading}>Pages</div>
        {isFeature && <div className={styles.stageToggle} role="group" aria-label={`${selectedGroup} stage`}>{SIMULATOR_STAGES.map(item => <button key={item} type="button" aria-pressed={shownStage === item} onClick={() => chooseStage(item)}>{item}</button>)}</div>}
        {isFeature && !groupPages.length && <p className={styles.stageEmpty}>Nothing here yet</p>}
        <div className={styles.cards}>{groupPages.map(page => <button data-page-id={page.id} className={styles.card} type="button" key={page.id} aria-pressed={activeIds.has(page.id)} onClick={() => choosePage(page.id)}>{page.label}<small>{page.path}</small></button>)}</div>
        {!pageId && <p>Unmapped route: {currentPath}</p>}
      </aside>
      {branchColumns.map(parent => <aside key={parent.id} className={styles.controls} aria-label={`${parent.label} pages`}>
        <div className={styles.panelHeading}>{parent.label}</div>
        {Array.from(new Set(pages.filter(page => page.parentId === parent.id).map(page => page.section ?? "Pages"))).map(section => <section key={section}>
          <h2 className={styles.branchHeading}>{section}</h2>
          <div className={styles.cards}>{pages.filter(page => page.parentId === parent.id && (page.section ?? "Pages") === section).map(page => <button data-page-id={page.id} key={page.id} type="button" className={styles.card} aria-pressed={activeIds.has(page.id)} onClick={() => choosePage(page.id)}>{page.label}</button>)}</div>
        </section>)}
      </aside>)}
      <aside ref={conditionalColumn} className={styles.controls} aria-label="Conditionals">
        <div className={styles.panelHeading}>Conditionals</div>
        <div className={styles.cards}>{conditions?.length ? conditions.map((condition, index) => <Fragment key={condition.id}>{condition.section && condition.section !== conditions[index - 1]?.section && <h3 className={styles.conditionSection}>{condition.section}</h3>}{condition.playerCount ? <section key={condition.id} className={styles.controlSection}><label>{condition.label}<input type="number" aria-label={condition.label} min={1} max={64} placeholder="From data source" value={state.playerCount ?? ""} onChange={event => updateState("playerCount", event.target.value)} /></label></section> : <Fragment key={condition.id}><button className={styles.card} type="button" aria-pressed={condition.source ? source === condition.source : Object.entries(condition.state ?? {}).every(([key, value]) => (state[key as keyof SimulatorState] ?? (key === "wallpaper" ? "default" : key === "brandStyle" ? "gold" : key === "brandStage" ? "drawing" : key === "tvPhase" ? "live" : key === "tvKind" ? "trip" : key === "tvTeams" ? "two" : key === "tvGroup" ? "2" : key === "liveMode" ? "board" : key === "liveStats" ? "closed" : key === "liveFull" ? "off" : key in ROUND_PRESSED_DEFAULTS ? ROUND_PRESSED_DEFAULTS[key] : key === "draftSim" ? "off" : state.draftSim && state.draftSim !== "off" ? DRAFT_SIM_DEFAULTS[key as keyof typeof DRAFT_SIM_DEFAULTS] : undefined)) === value)} onClick={() => { if (condition.source) chooseSource(condition.source); if (condition.state) setState(current => ({ ...current, ...condition.state }));
            // TV mode has no simulator bridge: load it again with the picked stage / event kind in its address.
            if (condition.state && isTvPage(selectedPage)) { setReady(false); setFrameSrc(withParams(frameUrl(selectedPage), `simulator=1${liveParam(selectedPage, view, { ...state, ...condition.state })}&command=${++command.current}`)); } }}>{condition.label}</button>
          {/* Just created: wipe everything set up on it and go back to the fresh, just-onboarded trip. */}
          {condition.source === "empty" && <button type="button" className={styles.resetJustCreated} onClick={() => { resetJustCreated(); chooseSource("empty"); }}><RotateCcw size={13} /> Reset Just created</button>}
          {/* The Maroon Masters: wipe everything set up on it and start the official trip over (the app frame reloads fresh). */}
          {condition.source === "masters" && <button type="button" className={styles.resetJustCreated} onClick={() => {
            resetDevSetup(devTripScope({ source: "masters", state }));
            chooseSource("masters");
            try { iframe.current?.contentWindow?.location.reload(); } catch { /* the frame reloads on its next navigation */ }
          }}><RotateCcw size={13} /> Reset The Maroon Masters</button>}
</Fragment>}</Fragment>) : <p>No conditional states</p>}</div>
        {/* Notifications → Phone / In-app: preview the Highlights Engine's real output (rules, quips, decisions) on these same screens. */}
        {(currentPath === "/dev/notifications/phone" || currentPath === "/dev/notifications/in-app") && <HighlightScenarioControls value={state.highlightSim} onChange={next => setState(current => ({ ...current, highlightSim: next }))} />}
        {/* Authentication → Email confirmed / Profile created: replay the gold M animation (same counter as the logo entrance). */}
        {(currentPath === "/dev/auth/link-result" || currentPath === "/dev/auth/profile-created") && <section className={styles.controlSection} aria-label="Email confirmed animation controls">
          <button type="button" onClick={() => setState(current => ({ ...current, brandReplay: (current.brandReplay ?? 0) + 1 }))}><RotateCcw size={13} /> Replay animation</button>
        </section>}
        {isBrandIntro && <section className={styles.controlSection} aria-label="Logo animation controls">
          <button type="button" onClick={() => setState(current => ({ ...current, brandStage: "drawing", brandReplay: (current.brandReplay ?? 0) + 1 }))}><RotateCcw size={13} /> Replay entrance</button>
          <label>Drawing time: {((state.brandDuration ?? 1200) / 1000).toFixed(1)} s
            <input type="range" aria-label="Logo drawing time" min={600} max={2400} step={100} value={state.brandDuration ?? 1200} onChange={event => setState(current => ({ ...current, brandDuration: Number(event.target.value) }))} />
          </label>
        </section>}
        {/* Mock data only: a whole new made-up trip that reads like a real one (people, place, dates, courses, formats, scores,
            tee times, dinners, travel, rules) from a new seed. */}
        {!isBrandIntro && source === "mock" && !scenarioVisible && !!selectedPage.conditions?.length && <button type="button" onClick={() => setState(current => ({ ...current, seed: 1 + Math.floor(Math.random() * 2 ** 31) }))}><Shuffle size={13} /> Randomize data</button>}
        {!!selectedPage.conditions?.length && <button type="button" onClick={() => { setState(DEFAULT_SIMULATOR_STATE); setSource("maroon"); }}><RotateCcw size={13} /> Reset conditionals</button>}
      </aside>
      {scenarioVisible && <TripScenarioControls state={state} onChange={changes=>setState(current=>normalizeTripScenario({...current,...changes}))} onReset={()=>{resetDevSetup(devTripScope(config));initializeTripScenario(config);iframe.current?.contentWindow?.location.reload();}}/>}
      {mockDraftPreset && <MockDraftPanel preset={mockDraftPreset} viewer={state.mockDraftViewer ?? "organizer"} onViewer={viewer => setState(current => ({ ...current, mockDraftViewer: viewer }))} />}
      {mockMatchPreset && <MockMatchPanel preset={mockMatchPreset} viewer={state.mockMatchViewer ?? "organizer"} onViewer={viewer => setState(current => ({ ...current, mockMatchViewer: viewer }))} />}
      <div className={styles.previewColumn}>
        <div className={styles.stage} ref={stage}>
          <HapticsVisualizer>
          <div className={styles.deviceSpace} style={{ width: frameWidth * scale, height: frameHeight * scale }}>
            <div className={`${styles.device} ${desktopPreview ? styles.desktopDevice : ""} ${watch ? styles.watchDevice : ""} ${car ? styles.carDevice : ""} ${device === "tv" ? styles.tvDevice : ""}`} style={{ width: frameWidth, height: frameHeight, transform: `scale(${scale})`, "--safe-top": `${insets.top}px`, "--safe-bottom": `${insets.bottom}px` } as CSSProperties}>
              {/* CarPlay: a pretend side bar (and, in Dashboard, a pretend map) beside our app. Drawings only. */}
              {car && <div className={styles.carDock} aria-hidden><span className={styles.carClock}>9:41</span><span className={styles.carIcon} style={{ background: "#34c759" }} /><span className={styles.carIcon} style={{ background: "#0a84ff" }} /><span className={styles.carIcon} style={{ background: "#7b1e2e" }} /><span className={styles.carHome} /></div>}
              {dash && <div className={styles.carMap} aria-hidden><span className={styles.carArrow} /></div>}
              <div className={dash ? `${styles.carColumn} ${device === "carplaydashbottom" ? styles.carColumnBottom : ""}` : styles.passThrough}>
              <div ref={setScreen} className={styles.screen} style={{ width: size.width, height: size.height, ...(desktopPreview ? { borderRadius: 4 } : {}), ...(screenRadius ? { borderRadius: screenRadius } : {}) }}>
              <iframe ref={iframe} title={selectedPage.standalone ? `${selectedPage.group} preview` : "Mobile application preview"} src={frameSrc} width={size.width} height={size.height}
                style={{ width: size.width, height: size.height, minWidth: size.width, minHeight: size.height, maxWidth: "none", maxHeight: "none", ...(screenRadius ? { borderRadius: screenRadius } : {}) }}
                className={`${styles.frame} ${desktopPreview ? styles.desktopFrame : ""}`} onLoad={() => { setReady(true); observeAppearance(); sendConfig(); }} />
              {selectedPage.origin && downOrigin === selectedPage.origin && <div role="status" style={{ position: "absolute", inset: 0, display: "grid", placeContent: "center", gap: 12, padding: 24, background: "#240001", color: "#fbf8f1", textAlign: "center", fontFamily: "var(--font-barlow), sans-serif" }}>
                <strong style={{ font: "400 26px/1.2 var(--font-spectral), Georgia, serif" }}>The auth test server isn&apos;t running</strong>
                <p style={{ margin: 0, fontSize: 14, color: "#e1cec4" }}>These screens come from {selectedPage.origin} (MM-Website-authdev, maroon-auth-dev). In that folder run <code>node authdev-start.mjs</code>, then check again.</p>
                <button type="button" style={{ justifySelf: "center", padding: "10px 18px", borderRadius: 8, border: 0, background: "#c9a86e", color: "#240001", fontWeight: 600 }} onClick={() => { setOriginCheck(count => count + 1); setFrameSrc(`${frameUrl(selectedPage)}?simulator=1&command=${++command.current}`); }}>Check again</button>
              </div>}
              {/* The phone's front camera, drawn over the screen like the real hardware (taps pass through). */}
              {view === "app" && !websitePreview && device.startsWith("iphone") && <span className={`${styles.camera} ${styles.dynamicIsland}`} aria-hidden />}
              {view === "app" && !websitePreview && device.startsWith("pixel") && <span className={`${styles.camera} ${styles.punchHole}`} aria-hidden />}
              </div>
              {dash && <div className={styles.carNowPlaying} aria-hidden><span className={styles.carAlbum} /><span><i /><i /></span></div>}
              </div>
              {showSafeAreas && <div className={styles.safeGuides} aria-hidden><span /><span /></div>}
            </div>
          </div>
          </HapticsVisualizer>
          <div ref={caption} className={styles.caption}>{ready ? selectedPage.label : "Loading application…"}<span>{Math.round(scale * 100)}% display · {size.width} × {size.height} CSS px</span><button type="button" onClick={() => { try { iframe.current?.contentWindow?.scrollTo({ top: 0, behavior: "smooth" }); } catch { /* external route */ } }}>Reset scroll</button></div>
        </div>
        <footer className={styles.footer}>Shared application components · Controls and fixture overrides stay in development</footer>
      </div>
      <DesignReview key={`${currentPath}:${pageId}`} screen={screen} frame={iframe} width={size.width} height={size.height}>
        <section className={styles.controlSection} aria-labelledby="haptics-heading">
          <h2 id="haptics-heading">Haptics test</h2>
          <label>Intensity {hapticLevel}/10<input type="range" aria-label="Haptic test level" min={0} max={10} step={1} value={hapticLevel} onChange={event => setHapticLevel(Number(event.target.value))} /></label>
          <label>Duration (milliseconds)<input type="number" aria-label="Haptic test duration" min={50} max={5000} step={50} value={hapticDuration} onChange={event => setHapticDuration(Math.max(50, Math.min(5000, Number(event.target.value) || 1000)))} /></label>
          <button type="button" onClick={() => { void lightTap({ intensity: hapticLevel, durationMs: hapticDuration }); }}>Test haptic</button>
          <p>Visual simulation only. Native feedback uses device presets. Reduced motion keeps the meter without shaking.</p>
        </section>
        <section className={styles.controlSection} aria-labelledby="gps-heading">
          <h2 id="gps-heading">GPS test</h2>
          {gps ? <>
            <div className={styles.gpsToggle} role="group" aria-label="GPS source">
              {(["real", "mock"] as const).map(mode => <button key={mode} type="button" aria-pressed={gps.mode === mode} onClick={() => sendGps({ mode })}>{mode === "real" ? "Real GPS" : "Mock GPS"}</button>)}
            </div>
            <p>Accuracy: <strong>{gps.source === "mock" ? "Mock (exact)" : gps.accuracyMeters !== null ? `±${Math.round(gps.accuracyMeters / 0.9144)} yds` : "Waiting for a fix…"}</strong></p>
            {gps.mode === "mock" && <div className={styles.gpsPad} role="group" aria-label="Move mock player 10 yards">
              <button type="button" className={styles.gpsUp} aria-label="Move north" onClick={() => sendGps({ move: { north: 1, east: 0 } })}><ArrowUp size={14} aria-hidden /></button>
              <button type="button" className={styles.gpsLeft} aria-label="Move west" onClick={() => sendGps({ move: { north: 0, east: -1 } })}><ArrowLeft size={14} aria-hidden /></button>
              <button type="button" className={styles.gpsReset} aria-label="Reset to the tee" onClick={() => sendGps({ reset: true })}><RotateCcw size={13} aria-hidden /></button>
              <button type="button" className={styles.gpsRight} aria-label="Move east" onClick={() => sendGps({ move: { north: 0, east: 1 } })}><ArrowRight size={14} aria-hidden /></button>
              <button type="button" className={styles.gpsDown} aria-label="Move south" onClick={() => sendGps({ move: { north: -1, east: 0 } })}><ArrowDown size={14} aria-hidden /></button>
            </div>}
            <p>Moves the mock player 10 yards; ↺ puts them back on the tee. Not part of the app — real players never see these.</p>
          </> : <p>Open a GPS screen in the phone (Golf Trip Active → GPS prototype, or Scoring → GPS) to switch Real / Mock GPS and move the mock player.</p>}
        </section>
      </DesignReview>
    </div>
  </main>;
}
