import type { Stroke } from "./annotations";
import { paintAnnotations } from "./annotations";

export async function reviewSnapshot(frame: HTMLIFrameElement, strokes: Stroke[], includeFrame: boolean): Promise<Blob> {
  const doc = frame.contentDocument;
  const win = frame.contentWindow;
  if (!doc?.body || !win || win.location.origin !== window.location.origin) throw new Error("Snapshots require a loaded, same-origin screen.");
  const width = win.innerWidth, height = win.innerHeight;
  const scrollX = win.scrollX, scrollY = win.scrollY;
  await doc.fonts.ready;
  const { default: html2canvas } = await import("html2canvas-pro");
  const screen = await html2canvas(doc.documentElement, {
    width, height, x: scrollX, y: scrollY, scrollX, scrollY,
    windowWidth: width, windowHeight: height, scale: 2,
    useCORS: true, allowTaint: false, logging: false,
    ignoreElements: element => element.tagName.toLowerCase() === "nextjs-portal",
    onclone: clone => {
      // Smooth scrolling must not animate the clone away from the captured viewport.
      const style = clone.createElement("style");
      style.textContent = "* { scroll-behavior: auto !important; }";
      clone.head.append(style);
      // Excluding dev portals can shorten the cloned page. Keep enough scroll range
      // so the renderer does not shift fixed content relative to its crop origin.
      clone.documentElement.style.minHeight = `${Math.max(doc.documentElement.scrollHeight, height + scrollY)}px`;
      clone.documentElement.style.minWidth = `${Math.max(doc.documentElement.scrollWidth, width + scrollX)}px`;
      clone.defaultView?.scrollTo({ left: scrollX, top: scrollY, behavior: "instant" });
    },
  });
  const annotations = document.createElement("canvas");
  annotations.width = width * 2; annotations.height = height * 2;
  const ink = annotations.getContext("2d")!;
  ink.scale(2, 2);
  paintAnnotations(ink, strokes, width, height);
  const output = document.createElement("canvas");
  const border = includeFrame ? 8 : 0;
  output.width = (width + border * 2) * 2;
  output.height = (height + border * 2) * 2;
  const ctx = output.getContext("2d")!;
  if (includeFrame) {
    ctx.fillStyle = "#343841";
    ctx.beginPath(); ctx.roundRect(0, 0, output.width, output.height, 64); ctx.fill();
    ctx.beginPath(); ctx.roundRect(16, 16, width * 2, height * 2, 50); ctx.clip();
  }
  ctx.drawImage(screen, border * 2, border * 2);
  ctx.drawImage(annotations, border * 2, border * 2);
  return new Promise((resolve, reject) => output.toBlob(blob => blob ? resolve(blob) : reject(new Error("PNG export failed.")), "image/png"));
}
