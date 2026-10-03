"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { MonitorSmartphone, RotateCcw, SlidersHorizontal } from "lucide-react";
import { GOLF_MATCH_PREVIEWS } from "@/lib/platform/golfTripPreviewFixture";
import { DEFAULT_SIMULATOR_STATE, SIMULATOR_CHANNEL, SIMULATOR_DEVICES, SIMULATOR_SOURCES, SIMULATOR_STATES, type SimulatorConfig, type SimulatorPage, type SimulatorSource, type SimulatorState } from "@/lib/dev/simulator";
import { applySimulatorSafeAreas } from "./simulatorSafeAreas";
import styles from "./DevSimulator.module.css";

const initialDevice = SIMULATOR_DEVICES[4];
const bounded = (value: string, min: number, max: number, fallback: number) => value === "" || !Number.isFinite(Number(value)) ? fallback : Math.max(min, Math.min(max, Math.round(Number(value))));

export function DevSimulator({ pages, unmapped }: { pages: SimulatorPage[]; unmapped: Record<string, unknown> }) {
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
  const iframe = useRef<HTMLIFrameElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const command = useRef(0);
  const config = useMemo<SimulatorConfig>(() => ({ source, state, navigation }), [source, state, navigation]);
  const selectedPage = pages.find(page => page.id === pageId) ?? initialPage;
  const supportsFixtures = currentPath.startsWith("/dev/tournament");
  const supportsState = currentPath === "/dev/tournament";
  const preset = SIMULATOR_DEVICES.find(item => item.id === device)!;
  const scale = zoom === "fit" ? Math.max(0.2, Math.min(1, (available.width - 64) / (size.width + 16), (available.height - 88) / (size.height + 16))) : Number(zoom);

  const sendConfig = useCallback(() => {
    iframe.current?.contentWindow?.postMessage({ channel: SIMULATOR_CHANNEL, type: "config", config }, window.location.origin);
  }, [config]);

  useEffect(() => {
    const target = stage.current;
    if (!target) return;
    const observer = new ResizeObserver(([entry]) => setAvailable({ width: entry.contentRect.width, height: entry.contentRect.height }));
    observer.observe(target);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    function receive(event: MessageEvent) {
      if (event.origin !== window.location.origin || event.source !== iframe.current?.contentWindow || event.data?.channel !== SIMULATOR_CHANNEL || event.data?.type !== "ready") return;
      if (typeof event.data.path === "string") setCurrentPath(event.data.path);
      setReady(true);
      sendConfig();
    }
    window.addEventListener("message", receive);
    sendConfig();
    return () => window.removeEventListener("message", receive);
  }, [sendConfig]);

  // Also covers client-side app navigation and styles added by Next's dev HMR.
  useEffect(() => {
    const update = () => {
      try {
        const frame = iframe.current;
        if (!frame?.contentDocument || !frame.contentWindow) return;
        const path = frame.contentWindow.location.pathname;
        setCurrentPath(path);
        applySimulatorSafeAreas(frame.contentDocument, insets.top, insets.bottom);
      } catch { /* External destinations are outside this same-origin simulator. */ }
    };
    update();
    const timer = window.setInterval(update, 750);
    return () => window.clearInterval(timer);
  }, [insets]);

  function choosePage(id: string) {
    const next = pages.find(page => page.id === id)!;
    setPageId(id);
    setNavigation(next.navigation ? { ...next.navigation, command: ++command.current } : undefined);
    let path = currentPath;
    try { path = iframe.current?.contentWindow?.location.pathname ?? path; } catch { /* recover via src below */ }
    if (path !== next.path) {
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

  return <main className={styles.shell}>
    <header className={styles.header}>
      <div className={styles.brand}><MonitorSmartphone size={22} /><div><h1>App simulator</h1><p>The Maroon · Development workspace</p></div></div>
      <span className={styles.devBadge}><span /> LOCAL DEV</span>
    </header>
    <div className={styles.workspace}>
      <aside className={styles.controls} aria-label="Development controls">
        <div className={styles.panelHeading}><SlidersHorizontal size={16} /> Preview controls</div>
        <section className={styles.controlSection} aria-labelledby="device-heading">
          <h2 id="device-heading">Device</h2>
          <label>Preset<select aria-label="Device preset" value={device} onChange={event => chooseDevice(event.target.value)}>{SIMULATOR_DEVICES.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
          <div className={styles.pair}>
            {(["width", "height"] as const).map(edge => <label key={edge}>{edge === "width" ? "Width" : "Height"}<div className={styles.unitInput}><input type="number" aria-label={`Viewport ${edge}`} min={edge === "width" ? 240 : 320} max={edge === "width" ? 1600 : 1800} value={sizeText[edge]} onChange={event => editSize(edge, event.target.value)} onBlur={event => editSize(edge, event.target.value, true)} /><span>px</span></div></label>)}
          </div>
          <label>Display scale<select aria-label="Display scale" value={zoom} onChange={event => setZoom(event.target.value)}><option value="fit">Fit to workspace</option><option value="1">100%</option><option value="0.75">75%</option><option value="0.5">50%</option></select></label>
          <details className={styles.advanced}><summary>Safe-area testing</summary><div className={styles.pair}>{(["top", "bottom"] as const).map(edge => <label key={edge}>{edge === "top" ? "Top inset" : "Bottom inset"}<input type="number" aria-label={`Safe-area ${edge}`} min={0} max={100} value={insets[edge]} onChange={event => setInsets(current => ({ ...current, [edge]: bounded(event.target.value, 0, 100, 0) }))} /></label>)}</div><label className={styles.checkbox}><input type="checkbox" checked={showSafeAreas} onChange={event => setShowSafeAreas(event.target.checked)} />Show inset guides</label><p>Editable insets exercise existing safe-area CSS. Display scale keeps the CSS viewport unchanged.</p></details>
        </section>
        <section className={styles.controlSection} aria-labelledby="page-heading"><h2 id="page-heading">Page</h2><label>App view<select aria-label="App page" value={pageId} onChange={event => choosePage(event.target.value)}>{pages.map(page => <option key={page.id} value={page.id}>{page.label}</option>)}</select></label><p className={styles.route}>{currentPath}</p></section>
        <section className={styles.controlSection} aria-labelledby="data-heading"><h2 id="data-heading">Data source</h2><label>Golf Trip fixtures<select aria-label="Data source" value={source} disabled={!supportsFixtures} onChange={event => setSource(event.target.value as SimulatorSource)}>{SIMULATOR_SOURCES.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label><p>{supportsFixtures ? source === "maroon" ? "Real Maroon source → existing Golf Trip adapter." : source === "empty" ? "Incomplete trip, no leaderboard or saved flights." : source === "busy" ? "32 fictional golfers and eight planned rounds." : "Generic trip and format fixtures." : "This route uses its existing data loader and session."}</p></section>
        {supportsFixtures && source === "maroon" && <details className={styles.inspector}><summary>Unmapped Tournament Data</summary><pre>{JSON.stringify(unmapped, null, 2)}</pre></details>}
        <section className={styles.controlSection} aria-labelledby="state-heading"><div className={styles.sectionHeading}><h2 id="state-heading">App state</h2><button type="button" aria-label="Reset app state" onClick={() => setState(DEFAULT_SIMULATOR_STATE)}><RotateCcw size={13} />Reset</button></div>
          {SIMULATOR_STATES.map(field => <label key={field.id}>{field.label}{field.kind === "pending" ? <><select disabled aria-label={field.label}><option>Adapter pending</option></select><small>{field.note}</small></> : field.kind === "number" ? <input type="number" min={1} max={64} placeholder="From data source" aria-label={field.label} disabled={!supportsState} value={state.playerCount ?? ""} onChange={event => updateState(field.id, event.target.value)} /> : <select aria-label={field.label} disabled={!supportsState} value={String(state[field.id])} onChange={event => updateState(field.id, event.target.value)}>{field.kind === "format" ? <><option value="source">From data source</option>{Object.entries(GOLF_MATCH_PREVIEWS).map(([key, sample]) => <option key={key} value={key}>{sample.format}</option>)}</> : field.options.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select>}</label>)}
          <p>{supportsState ? "Presentation overrides only. Empty states use the data-source selector. Player count changes the trip answer; busy fixtures also resize the roster." : "State controls apply to Golf Trip views. Settings keeps its existing local configuration preview."}</p>
        </section>
      </aside>
      <div className={styles.previewColumn}>
        <div className={styles.previewToolbar}><div><span className={styles.statusDot} />{preset.label}<span className={styles.dimensions}>{size.width} × {size.height}</span></div><button type="button" onClick={() => { try { iframe.current?.contentWindow?.scrollTo({ top: 0, behavior: "smooth" }); } catch { /* external route */ } }}>Reset scroll</button></div>
        <div className={styles.stage} ref={stage}>
          <div className={styles.deviceSpace} style={{ width: (size.width + 16) * scale, height: (size.height + 16) * scale }}>
            <div className={styles.device} style={{ width: size.width + 16, height: size.height + 16, transform: `scale(${scale})`, "--safe-top": `${insets.top}px`, "--safe-bottom": `${insets.bottom}px` } as CSSProperties}>
              <iframe ref={iframe} title="Mobile application preview" src={frameSrc} width={size.width} height={size.height}
                style={{ width: size.width, height: size.height, minWidth: size.width, minHeight: size.height, maxWidth: "none", maxHeight: "none" }}
                className={styles.frame} onLoad={() => { setReady(true); sendConfig(); }} />
              {showSafeAreas && <div className={styles.safeGuides} aria-hidden><span /><span /></div>}
            </div>
          </div>
          <div className={styles.caption}>{ready ? selectedPage.label : "Loading application…"}<span>{Math.round(scale * 100)}% display · {size.width} × {size.height} CSS px</span></div>
        </div>
        <footer className={styles.footer}>Shared application components · Controls and fixture overrides stay in development</footer>
      </div>
    </div>
  </main>;
}
