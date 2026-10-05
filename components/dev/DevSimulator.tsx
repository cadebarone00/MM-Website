"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, MonitorSmartphone, RotateCcw, SlidersHorizontal } from "lucide-react";
import { DEFAULT_SIMULATOR_STATE, parseGpsState, parseSimulatorLocation, simulatorPageForLocation, SIMULATOR_CHANNEL, SIMULATOR_DEVICES, type SimulatorConfig, type SimulatorGpsCommand, type SimulatorGpsState, type SimulatorPage, type SimulatorSource, type SimulatorState } from "@/lib/dev/simulator";
import { applySimulatorSafeAreas } from "./simulatorSafeAreas";
import { HapticsVisualizer } from "./HapticsVisualizer";
import { DesignReview } from "./DesignReview";
import { lightTap } from "@/lib/haptics";
import styles from "./DevSimulator.module.css";

const initialDevice = SIMULATOR_DEVICES[4];
const bounded = (value: string, min: number, max: number, fallback: number) => value === "" || !Number.isFinite(Number(value)) ? fallback : Math.max(min, Math.min(max, Math.round(Number(value))));

export function DevSimulator({ pages: registryPages, unmapped }: { pages: SimulatorPage[]; unmapped: Record<string, unknown> }) {
  const [settingsRounds, setSettingsRounds] = useState<{ id: string; number: number }[]>([]);
  const pages = useMemo(() => [...registryPages, ...settingsRounds.map(round => ({ ...registryPages.find(page => page.id === "settings-competition-rounds")!, id: `settings-round-${round.id}`, label: `Round ${round.number}`, parentId: "settings-competition-rounds", navigation: { tab: "Home" as const, settingsView: `round-${round.id}` } }))], [registryPages, settingsRounds]);
  const initialPage = pages.find(page => page.path === "/dev/tournament") ?? pages[0];
  const [pageId, setPageId] = useState(initialPage.id);
  const [frameSrc, setFrameSrc] = useState(`${initialPage.path}?simulator=1`);
  const [currentPath, setCurrentPath] = useState(initialPage.path);
  const [device, setDevice] = useState<string>(initialDevice.id);
  const [size, setSize] = useState({ width: initialDevice.width as number, height: initialDevice.height as number });
  const [sizeText, setSizeText] = useState({ width: String(initialDevice.width), height: String(initialDevice.height) });
  const [insets, setInsets] = useState({ top: initialDevice.top as number, bottom: initialDevice.bottom as number });
  const [showSafeAreas, setShowSafeAreas] = useState(false);
  const [zoom, setZoom] = useState("fit");
  const [available, setAvailable] = useState({ width: 700, height: 850 });
  const [source, setSource] = useState<SimulatorSource>("maroon");
  const [state, setState] = useState<SimulatorState>(DEFAULT_SIMULATOR_STATE);
  const [navigation, setNavigation] = useState(initialPage.navigation);
  const [ready, setReady] = useState(false);
  const [hapticLevel, setHapticLevel] = useState(2);
  const [hapticDuration, setHapticDuration] = useState(1000);
  // GPS test: the open GPS screen's state (null when the phone isn't showing one).
  const [gps, setGps] = useState<SimulatorGpsState | null>(null);
  const iframe = useRef<HTMLIFrameElement>(null);
  const [screen, setScreen] = useState<HTMLDivElement | null>(null);
  const stage = useRef<HTMLDivElement>(null);
  const caption = useRef<HTMLDivElement>(null);
  const command = useRef(0);
  const bridgeReady = useRef(false);
  const config = useMemo<SimulatorConfig>(() => ({ source, state, navigation }), [source, state, navigation]);
  const selectedPage = pages.find(page => page.id === pageId) ?? { ...initialPage, label: `Current route · ${currentPath}` };
  const supportsFixtures = currentPath.startsWith("/dev/tournament");
  const groups = Array.from(new Set(pages.map(page => page.group ?? "Other")));
  const selectedGroup = selectedPage.group ?? "Other";
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
  const scale = zoom === "fit" ? Math.max(0.01, Math.min(Math.max(1, available.width - 184) / (size.width + 16), available.height / (size.height + 16))) : Number(zoom);

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
      if (event.origin !== window.location.origin || event.source !== iframe.current?.contentWindow || event.data?.channel !== SIMULATOR_CHANNEL || !["ready", "location"].includes(event.data.type)) return;
      const location = parseSimulatorLocation(event.data.location);
      if (!location) return;
      const rounds = event.data.location?.rounds;
      if (location.path === "/dev/tournament/settings" && Array.isArray(rounds) && rounds.length <= 100 && rounds.every(round => round && typeof round.id === "string" && /^[a-z0-9-]{1,80}$/.test(round.id) && Number.isInteger(round.number) && round.number > 0)) {
        setSettingsRounds(current => JSON.stringify(current) === JSON.stringify(rounds) ? current : rounds.map(({ id, number }: { id: string; number: number }) => ({ id, number })));
      }
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
  }, [sendConfig, pages]);

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
    setPageId(id);
    const requested = next.navigation ? { ...next.navigation, command: ++command.current } : undefined;
    setNavigation(requested);
    let path = currentPath;
    try { path = iframe.current?.contentWindow?.location.pathname ?? path; } catch { bridgeReady.current = false; }
    if (bridgeReady.current) {
      // Apply the request before navigating so the next screen receives current fixtures/tab.
      iframe.current?.contentWindow?.postMessage({ channel: SIMULATOR_CHANNEL, type: "config", config: { ...config, navigation: requested }, routes: pages.map(page => page.path) }, window.location.origin);
      if (path !== next.path) iframe.current?.contentWindow?.postMessage({ channel: SIMULATOR_CHANNEL, type: "navigate", path: next.path }, window.location.origin);
    } else if (path !== next.path) {
      setReady(false);
      setFrameSrc(`${next.path}?simulator=1&command=${++command.current}`);
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
  function updateState(id: string, value: string) {
    setState(current => ({ ...current, [id]: id === "playerCount" ? value === "" ? null : bounded(value, 1, 64, 8) : value }));
  }
  function editSize(edge: "width" | "height", value: string, commit = false) {
    const min = edge === "width" ? 240 : 320;
    const max = edge === "width" ? 1600 : 1800;
    const parsed = Number(value);
    if (!commit || bounded(value, min, max, size[edge]) !== size[edge]) setDevice("custom");
    setSizeText(current => ({ ...current, [edge]: commit ? String(bounded(value, min, max, size[edge])) : value }));
    if (commit || (value !== "" && Number.isInteger(parsed) && parsed >= min && parsed <= max)) {
      setSize(current => ({ ...current, [edge]: bounded(value, min, max, current[edge]) }));
    }
  }

  return <main className={styles.shell} style={{ "--phone-aspect": (size.width + 16) / (size.height + 16), "--phone-display-width": zoom === "fit" ? "0px" : `${(size.width + 16) * Number(zoom)}px` } as CSSProperties}>
    <header className={styles.header}>
      <div className={styles.brand}><MonitorSmartphone size={22} /><div><h1>App simulator</h1><p>The Maroon · Development workspace</p></div></div>
      <div className={styles.headerStatus}><span className={styles.headerDevice}>{preset.label}</span><span className={styles.devBadge}><span /> LOCAL DEV</span></div>
    </header>
    <div className={styles.workspace} style={{ gridTemplateColumns: `var(--groups-width) var(--pages-width) ${branchColumns.map(() => "var(--pages-width)").join(" ")} var(--conditions-width) minmax(var(--preview-min-width),1fr) 230px` }}>
      <aside className={styles.controls} aria-label="Development controls">
        <div className={styles.panelHeading}><SlidersHorizontal size={16} /> Groups</div>
        <div className={styles.cards}>{groups.map(group => <button className={styles.card} type="button" key={group} aria-pressed={selectedGroup === group} onClick={() => choosePage(pages.find(page => (page.group ?? "Other") === group)!.id)}>{group}</button>)}</div>
        <section className={styles.controlSection} aria-labelledby="device-heading">
          <h2 id="device-heading">Device</h2>
          <label>Preset<select aria-label="Device preset" value={device} onChange={event => chooseDevice(event.target.value)}>{SIMULATOR_DEVICES.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
          <div className={styles.pair}>
            {(["width", "height"] as const).map(edge => <label key={edge}>{edge === "width" ? "Width" : "Height"}<div className={styles.unitInput}><input type="number" aria-label={`Viewport ${edge}`} min={edge === "width" ? 240 : 320} max={edge === "width" ? 1600 : 1800} value={sizeText[edge]} onChange={event => editSize(edge, event.target.value)} onBlur={event => editSize(edge, event.target.value, true)} /><span>px</span></div></label>)}
          </div>
          <label>Display scale<select aria-label="Display scale" value={zoom} onChange={event => setZoom(event.target.value)}><option value="fit">Fit to workspace</option><option value="1">100%</option><option value="0.75">75%</option><option value="0.5">50%</option></select></label>
          <details className={styles.advanced}><summary>Safe-area testing</summary><div className={styles.pair}>{(["top", "bottom"] as const).map(edge => <label key={edge}>{edge === "top" ? "Top inset" : "Bottom inset"}<input type="number" aria-label={`Safe-area ${edge}`} min={0} max={100} value={insets[edge]} onChange={event => setInsets(current => ({ ...current, [edge]: bounded(event.target.value, 0, 100, 0) }))} /></label>)}</div><label className={styles.checkbox}><input type="checkbox" checked={showSafeAreas} onChange={event => setShowSafeAreas(event.target.checked)} />Show inset guides</label><p>Editable insets exercise existing safe-area CSS. Display scale keeps the CSS viewport unchanged.</p></details>
        </section>
        {supportsFixtures && source === "maroon" && <details className={styles.inspector}><summary>Unmapped Tournament Data</summary><pre>{JSON.stringify(unmapped, null, 2)}</pre></details>}
      </aside>
      <aside className={styles.controls} aria-label="Pages">
        <div className={styles.panelHeading}>Pages</div>
        <div className={styles.cards}>{pages.filter(page => (page.group ?? "Other") === selectedGroup && !page.parentId).map(page => <button data-page-id={page.id} className={styles.card} type="button" key={page.id} aria-pressed={activeIds.has(page.id)} onClick={() => choosePage(page.id)}>{page.label}<small>{page.path}</small></button>)}</div>
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
        <div className={styles.cards}>{selectedPage.conditions?.length ? selectedPage.conditions.map(condition => condition.playerCount ? <section key={condition.id} className={styles.controlSection}><label>{condition.label}<input type="number" aria-label={condition.label} min={1} max={64} placeholder="From data source" value={state.playerCount ?? ""} onChange={event => updateState("playerCount", event.target.value)} /></label></section> : <button className={styles.card} type="button" key={condition.id} aria-pressed={condition.source ? source === condition.source : Object.entries(condition.state ?? {}).every(([key, value]) => state[key as keyof SimulatorState] === value)} onClick={() => { if (condition.source) setSource(condition.source); if (condition.state) setState(current => ({ ...current, ...condition.state })); }}>{condition.label}</button>) : <p>No conditional states</p>}</div>
        {!!selectedPage.conditions?.length && <button type="button" onClick={() => { setState(DEFAULT_SIMULATOR_STATE); setSource("maroon"); }}><RotateCcw size={13} /> Reset conditionals</button>}
      </aside>
      <div className={styles.previewColumn}>
        <div className={styles.stage} ref={stage}>
          <HapticsVisualizer>
          <div className={styles.deviceSpace} style={{ width: (size.width + 16) * scale, height: (size.height + 16) * scale }}>
            <div className={styles.device} style={{ width: size.width + 16, height: size.height + 16, transform: `scale(${scale})`, "--safe-top": `${insets.top}px`, "--safe-bottom": `${insets.bottom}px` } as CSSProperties}>
              <div ref={setScreen} className={styles.screen} style={{ width: size.width, height: size.height }}>
              <iframe ref={iframe} title="Mobile application preview" src={frameSrc} width={size.width} height={size.height}
                style={{ width: size.width, height: size.height, minWidth: size.width, minHeight: size.height, maxWidth: "none", maxHeight: "none" }}
                className={styles.frame} onLoad={() => { setReady(true); sendConfig(); }} />
              {/* The phone's front camera, drawn over the screen like the real hardware (taps pass through). */}
              {device.startsWith("iphone") && <span className={`${styles.camera} ${styles.dynamicIsland}`} aria-hidden />}
              {device.startsWith("pixel") && <span className={`${styles.camera} ${styles.punchHole}`} aria-hidden />}
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
