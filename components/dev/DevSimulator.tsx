"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { MonitorSmartphone, RotateCcw, SlidersHorizontal } from "lucide-react";
import { DEFAULT_SIMULATOR_STATE, parseSimulatorLocation, simulatorPageForLocation, SIMULATOR_CHANNEL, SIMULATOR_DEVICES, type SimulatorConfig, type SimulatorPage, type SimulatorSource, type SimulatorState } from "@/lib/dev/simulator";
import { applySimulatorSafeAreas } from "./simulatorSafeAreas";
import { HapticsVisualizer } from "./HapticsVisualizer";
import { lightTap } from "@/lib/haptics";
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
  const [hapticLevel, setHapticLevel] = useState(2);
  const [hapticDuration, setHapticDuration] = useState(1000);
  const iframe = useRef<HTMLIFrameElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const caption = useRef<HTMLDivElement>(null);
  const command = useRef(0);
  const bridgeReady = useRef(false);
  const config = useMemo<SimulatorConfig>(() => ({ source, state, navigation }), [source, state, navigation]);
  const selectedPage = pages.find(page => page.id === pageId) ?? { ...initialPage, label: `Current route · ${currentPath}` };
  const supportsFixtures = currentPath.startsWith("/dev/tournament");
  const groups = Array.from(new Set(pages.map(page => page.group ?? "Other")));
  const selectedGroup = selectedPage.group ?? "Other";
  const preset = SIMULATOR_DEVICES.find(item => item.id === device)!;
  // Fit may enlarge the visual frame. The iframe itself keeps its CSS viewport.
  const scale = zoom === "fit" ? Math.max(0.01, Math.min(Math.max(1, available.width - 100) / (size.width + 16), available.height / (size.height + 16))) : Number(zoom);

  const sendConfig = useCallback(() => {
    iframe.current?.contentWindow?.postMessage({ channel: SIMULATOR_CHANNEL, type: "config", config, routes: pages.map(page => page.path) }, window.location.origin);
  }, [config, pages]);

  useEffect(() => {
    const target = stage.current;
    if (!target) return;
    const measure = () => {
      const padding = getComputedStyle(target);
      const captionHeight = caption.current?.offsetHeight ?? 0;
      const captionMargin = caption.current ? parseFloat(getComputedStyle(caption.current).marginTop) || 0 : 0;
      setAvailable({
        width: target.clientWidth - parseFloat(padding.paddingLeft) - parseFloat(padding.paddingRight),
        height: target.clientHeight - parseFloat(padding.paddingTop) - parseFloat(padding.paddingBottom) - captionHeight - captionMargin,
      });
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
      setCurrentPath(location.path);
      setPageId(current => simulatorPageForLocation(pages, location, current)?.id ?? "");
      if (event.data.type === "ready") {
        bridgeReady.current = true;
        setReady(true);
        sendConfig();
      }
    }
    window.addEventListener("message", receive);
    sendConfig();
    return () => window.removeEventListener("message", receive);
  }, [sendConfig, pages]);

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

  return <main className={styles.shell}>
    <header className={styles.header}>
      <div className={styles.brand}><MonitorSmartphone size={22} /><div><h1>App simulator</h1><p>The Maroon · Development workspace</p></div></div>
      <span className={styles.devBadge}><span /> LOCAL DEV</span>
    </header>
    <div className={styles.workspace}>
      <aside className={styles.controls} aria-label="Development controls">
        <div className={styles.panelHeading}><SlidersHorizontal size={16} /> Groups</div>
        <div className={styles.cards}>{groups.map(group => <button className={styles.card} type="button" key={group} aria-pressed={selectedGroup === group} onClick={() => choosePage(pages.find(page => (page.group ?? "Other") === group)!.id)}>{group}</button>)}</div>
        <section className={styles.controlSection} aria-labelledby="haptics-heading">
          <h2 id="haptics-heading">Haptics test</h2>
          <label>Intensity {hapticLevel}/10<input type="range" aria-label="Haptic test level" min={0} max={10} step={1} value={hapticLevel} onChange={event => setHapticLevel(Number(event.target.value))} /></label>
          <label>Duration (milliseconds)<input type="number" aria-label="Haptic test duration" min={50} max={5000} step={50} value={hapticDuration} onChange={event => setHapticDuration(Math.max(50, Math.min(5000, Number(event.target.value) || 1000)))} /></label>
          <button type="button" onClick={() => { void lightTap({ intensity: hapticLevel, durationMs: hapticDuration }); }}>Test haptic</button>
          <p>Visual simulation only. Native feedback uses device presets. Reduced motion keeps the meter without shaking.</p>
        </section>
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
        <div className={styles.cards}>{pages.filter(page => (page.group ?? "Other") === selectedGroup).map(page => <button data-page-id={page.id} className={styles.card} type="button" key={page.id} aria-pressed={pageId === page.id} onClick={() => choosePage(page.id)}>{page.label}<small>{page.path}</small></button>)}</div>
        {!pageId && <p>Unmapped route: {currentPath}</p>}
      </aside>
      <aside className={styles.controls} aria-label="Conditionals">
        <div className={styles.panelHeading}>Conditionals</div>
        <div className={styles.cards}>{selectedPage.conditions?.length ? selectedPage.conditions.map(condition => condition.playerCount ? <section key={condition.id} className={styles.controlSection}><label>{condition.label}<input type="number" aria-label={condition.label} min={1} max={64} placeholder="From data source" value={state.playerCount ?? ""} onChange={event => updateState("playerCount", event.target.value)} /></label></section> : <button className={styles.card} type="button" key={condition.id} aria-pressed={condition.source ? source === condition.source : Object.entries(condition.state ?? {}).every(([key, value]) => state[key as keyof SimulatorState] === value)} onClick={() => { if (condition.source) setSource(condition.source); if (condition.state) setState(current => ({ ...current, ...condition.state })); }}>{condition.label}</button>) : <p>No conditional states</p>}</div>
        {!!selectedPage.conditions?.length && <button type="button" onClick={() => { setState(DEFAULT_SIMULATOR_STATE); setSource("maroon"); }}><RotateCcw size={13} /> Reset conditionals</button>}
      </aside>
      <div className={styles.previewColumn}>
        <div className={styles.previewToolbar}><div><span className={styles.statusDot} />{preset.label}<span className={styles.dimensions}>{size.width} × {size.height}</span></div><button type="button" onClick={() => { try { iframe.current?.contentWindow?.scrollTo({ top: 0, behavior: "smooth" }); } catch { /* external route */ } }}>Reset scroll</button></div>
        <div className={styles.stage} ref={stage}>
          <HapticsVisualizer>
          <div className={styles.deviceSpace} style={{ width: (size.width + 16) * scale, height: (size.height + 16) * scale }}>
            <div className={styles.device} style={{ width: size.width + 16, height: size.height + 16, transform: `scale(${scale})`, "--safe-top": `${insets.top}px`, "--safe-bottom": `${insets.bottom}px` } as CSSProperties}>
              <iframe ref={iframe} title="Mobile application preview" src={frameSrc} width={size.width} height={size.height}
                style={{ width: size.width, height: size.height, minWidth: size.width, minHeight: size.height, maxWidth: "none", maxHeight: "none" }}
                className={styles.frame} onLoad={() => { setReady(true); sendConfig(); }} />
              {showSafeAreas && <div className={styles.safeGuides} aria-hidden><span /><span /></div>}
            </div>
          </div>
          </HapticsVisualizer>
          <div ref={caption} className={styles.caption}>{ready ? selectedPage.label : "Loading application…"}<span>{Math.round(scale * 100)}% display · {size.width} × {size.height} CSS px</span></div>
        </div>
        <footer className={styles.footer}>Shared application components · Controls and fixture overrides stay in development</footer>
      </div>
    </div>
  </main>;
}
