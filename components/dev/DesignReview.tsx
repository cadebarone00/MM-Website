"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent, type RefObject, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { MousePointer2, PenLine, Highlighter, Eraser, Undo2, Redo2, Trash2, Eye, EyeOff, Copy, Download } from "lucide-react";
import { annotationPoint, paintAnnotations, strokeHit, type Point, type Stroke } from "@/lib/dev/annotations";
import { reviewSnapshot } from "@/lib/dev/snapshot";
import styles from "./DesignReview.module.css";

type Tool = "interact" | "pen" | "highlighter" | "eraser";
const tools = [{ id: "interact", label: "Interact", icon: MousePointer2, shortcut: "V" }, { id: "pen", label: "Pen", icon: PenLine, shortcut: "P" }, { id: "highlighter", label: "Highlighter", icon: Highlighter, shortcut: "H" }, { id: "eraser", label: "Eraser", icon: Eraser, shortcut: "E" }] as const;
const colors = [{ name: "Black", value: "#171717" }, { name: "White", value: "#ffffff" }, { name: "Red", value: "#dc2626" }];

export function DesignReview({ screen, frame, width, height, children }: { screen: HTMLDivElement | null; frame: RefObject<HTMLIFrameElement | null>; width: number; height: number; children?: ReactNode }) {
  const [tool, setTool] = useState<Tool>("interact");
  const [color, setColor] = useState(colors[2].value);
  const [penWidth, setPenWidth] = useState(3);
  const [highlightWidth, setHighlightWidth] = useState(20);
  const [eraseWidth, setEraseWidth] = useState(16);
  const [visible, setVisible] = useState(true);
  const [history, setHistory] = useState<Stroke[][]>([[]]);
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [captureFrame, setCaptureFrame] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const gesture = useRef<{ pointer: number; strokes: Stroke[]; draft?: Stroke; last: Point } | null>(null);
  const animation = useRef<number | null>(null);
  const snapshotBusy = useRef(false);
  const strokes = history[index];
  const thickness = tool === "highlighter" ? highlightWidth : tool === "eraser" ? eraseWidth : penWidth;
  const inkColor = tool === "highlighter" ? "#facc15" : color;

  const draw = useCallback(() => {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    const active = gesture.current;
    const lines = active ? [...active.strokes, ...(active.draft ? [active.draft] : [])] : strokes;
    paintAnnotations(ctx, visible ? lines : [], width, height);
  }, [strokes, visible, width, height]);

  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    element.width = width * 2; element.height = height * 2;
    element.getContext("2d")!.scale(2, 2);
    draw();
  }, [draw, screen, width, height]);
  useEffect(() => () => { if (animation.current !== null) cancelAnimationFrame(animation.current); }, []);

  const commit = useCallback((next: Stroke[]) => {
    const past = history.slice(0, index + 1).slice(-99);
    setHistory([...past, next]); setIndex(past.length);
  }, [history, index]);
  const select = useCallback((next: Tool) => {
    gesture.current = null;
    if (animation.current !== null) { cancelAnimationFrame(animation.current); animation.current = null; }
    draw();
    setTool(next);
    if (next !== "interact") setVisible(true);
    setStatus("");
  }, [draw]);
  const undo = useCallback(() => { gesture.current = null; setIndex(i => Math.max(0, i - 1)); }, []);
  const redo = useCallback(() => { gesture.current = null; setIndex(i => Math.min(history.length - 1, i + 1)); }, [history.length]);

  useEffect(() => {
    function keyboard(event: KeyboardEvent) {
      if (event.target instanceof HTMLElement && (event.target.closest("input,textarea,select,[contenteditable=true]") || event.altKey)) return;
      const key = event.key.toLowerCase();
      if ((event.ctrlKey || event.metaKey) && (key === "z" || key === "y")) {
        event.preventDefault();
        if (key === "y" || event.shiftKey) redo(); else undo();
      } else if (!event.ctrlKey && !event.metaKey) {
        const next = tools.find(item => item.shortcut.toLowerCase() === key);
        if (next || key === "escape") { event.preventDefault(); select(next?.id ?? "interact"); }
      }
    }
    window.addEventListener("keydown", keyboard);
    return () => window.removeEventListener("keydown", keyboard);
  }, [select, undo, redo]);

  function point(event: PointerEvent<HTMLCanvasElement>) {
    return annotationPoint(event.clientX, event.clientY, event.currentTarget.getBoundingClientRect());
  }
  function start(event: PointerEvent<HTMLCanvasElement>) {
    if (tool === "interact" || event.button !== 0 || gesture.current) return;
    event.preventDefault(); event.currentTarget.focus({ preventScroll: true });
    event.currentTarget.setPointerCapture(event.pointerId);
    const first = point(event);
    gesture.current = { pointer: event.pointerId, strokes, last: first,
      draft: tool === "eraser" ? undefined : { points: [first], color: inkColor, width: thickness / Math.min(width, height), highlight: tool === "highlighter" } };
    if (tool === "eraser") gesture.current.strokes = strokes.filter(stroke => !strokeHit(stroke, first, first, width, height, thickness / 2));
    draw();
  }
  function move(event: PointerEvent<HTMLCanvasElement>) {
    const active = gesture.current;
    if (!active || active.pointer !== event.pointerId) return;
    const samples = event.nativeEvent.getCoalescedEvents?.() ?? [];
    const rect = event.currentTarget.getBoundingClientRect();
    for (const sample of samples.length ? samples : [event]) {
      const next = annotationPoint(sample.clientX, sample.clientY, rect);
      if (active.draft) active.draft.points.push(next);
      else active.strokes = active.strokes.filter(stroke => !strokeHit(stroke, active.last, next, width, height, thickness / 2));
      active.last = next;
    }
    if (animation.current === null) animation.current = requestAnimationFrame(() => { animation.current = null; draw(); });
  }
  function finish(event: PointerEvent<HTMLCanvasElement>, cancel = false) {
    const active = gesture.current;
    if (!active || active.pointer !== event.pointerId) return;
    if (!cancel) move(event);
    if (animation.current !== null) { cancelAnimationFrame(animation.current); animation.current = null; }
    gesture.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (!cancel && (active.draft || active.strokes.length !== strokes.length)) commit([...active.strokes, ...(active.draft ? [active.draft] : [])]);
    else draw();
  }
  async function snapshot(copy: boolean) {
    if (!frame.current || snapshotBusy.current) return;
    snapshotBusy.current = true; setBusy(true); setStatus("Preparing snapshot…");
    try {
      if (copy && (!navigator.clipboard?.write || typeof ClipboardItem === "undefined")) throw new Error("Clipboard images are unavailable here. Use Download Snapshot.");
      const png = reviewSnapshot(frame.current, visible ? strokes : [], captureFrame);
      void png.catch(() => {}); // A clipboard denial may happen before rendering finishes.
      if (copy) {
        // Start write within the click gesture; deferred PNG keeps Safari activation intact.
        await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
        setStatus("Snapshot copied. Ready to paste.");
      } else {
        const blob = await png;
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a"); link.href = url;
        link.download = `design-review-${width}x${height}${captureFrame ? "-frame" : ""}.png`;
        link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
        setStatus("Snapshot downloaded.");
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Snapshot failed. Try Download Snapshot.");
    } finally { snapshotBusy.current = false; setBusy(false); }
  }

  return <section className={styles.review} aria-label="Design review">
    <div className={styles.heading}><span>Design review</span><span className={styles.mode} data-drawing={tool !== "interact"}>{tool === "interact" ? "Interact · app input enabled" : `${tools.find(item => item.id === tool)!.label} · app input paused`}</span></div>
    <div className={styles.toolbar} role="toolbar" aria-label="Annotation tools">
      <div className={styles.group}>{tools.map(({ id, label, icon: Icon, shortcut }) => <button key={id} type="button" aria-label={label} aria-pressed={tool === id} title={`${label} (${shortcut})`} onClick={() => select(id)}><Icon size={15} />{id === "interact" && label}</button>)}</div>
      <div className={styles.group} aria-label="Pen colors">{colors.map(item => <button className={styles.swatch} key={item.name} type="button" aria-label={`${item.name} pen`} aria-pressed={color === item.value && tool !== "highlighter" && tool !== "eraser"} title={`${item.name} pen`} onClick={() => { setColor(item.value); select("pen"); }}><span style={{ background: item.value }} /></button>)}{tool === "highlighter" && <span className={styles.sample} title="Yellow highlighter"><span style={{ background: "#facc15", width: 16, height: 16, opacity: .5 }} /></span>}</div>
      <div className={styles.group}><label className={styles.thickness}><span>Size</span><input aria-label="Stroke thickness" type="range" min={tool === "highlighter" ? 8 : 1} max={tool === "pen" || tool === "interact" ? 12 : 40} value={thickness} onChange={event => { const value = Number(event.target.value); if (tool === "highlighter") setHighlightWidth(value); else if (tool === "eraser") setEraseWidth(value); else setPenWidth(value); }} /><span className={styles.sample} aria-hidden><span style={{ width: thickness, height: thickness, background: tool === "eraser" ? "#737a87" : inkColor, opacity: tool === "highlighter" ? .32 : 1 }} /></span><output>{thickness}px</output></label></div>
      <div className={styles.group}>
        <button type="button" aria-label="Undo" title="Undo (Ctrl/⌘ Z)" disabled={index === 0} onClick={undo}><Undo2 size={15} /></button>
        <button type="button" aria-label="Redo" title="Redo (Ctrl/⌘ Shift Z)" disabled={index === history.length - 1} onClick={redo}><Redo2 size={15} /></button>
        <button type="button" aria-label="Clear annotations" title="Clear annotations (undoable)" disabled={!strokes.length} onClick={() => { gesture.current = null; commit([]); setStatus("Annotations cleared. Undo to restore."); }}><Trash2 size={15} /></button>
        <button type="button" aria-label={visible ? "Hide annotations" : "Show annotations"} title={visible ? "Hide annotations" : "Show annotations"} aria-pressed={visible} onClick={() => { gesture.current = null; setVisible(v => !v); setTool("interact"); }}>{visible ? <Eye size={15} /> : <EyeOff size={15} />}</button>
      </div>
      <div className={styles.group}>
        <select aria-label="Snapshot area" value={captureFrame ? "frame" : "screen"} onChange={event => setCaptureFrame(event.target.value === "frame")}><option value="screen">Screen only</option><option value="frame">Phone Frame</option></select>
        <button type="button" aria-label="Copy Snapshot" title="Copy Snapshot" disabled={busy} onClick={() => void snapshot(true)}><Copy size={14} />Copy</button>
        <button className={styles.download} type="button" aria-label="Download Snapshot" title="Download Snapshot" disabled={busy} onClick={() => void snapshot(false)}><Download size={14} />Download</button>
      </div>
    </div>
    <div className={styles.status} role="status">{status || "V interact · P pen · H highlight · E erase · Esc interact · Ctrl/⌘ Z undo"}</div>
    <div className={styles.extraControls}>{children}</div>
    {screen && createPortal(<canvas ref={canvas} className={styles.canvas} data-tool={tool} aria-label="Phone annotations" tabIndex={tool === "interact" ? -1 : 0} onPointerDown={start} onPointerMove={move} onPointerUp={event => finish(event)} onPointerCancel={event => finish(event, true)} onLostPointerCapture={event => finish(event, true)} />, screen)}
  </section>;
}
