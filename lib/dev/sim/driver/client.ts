import { runAction } from "./actions";
import type { DriverMessage } from "./types";

const ALLOWED_ORIGIN = "http://localhost:3001";

function ripple(el: Element) {
  const r = el.getBoundingClientRect();
  const dot = document.createElement("div");
  dot.style.cssText =
    `position:fixed;left:${r.left + r.width / 2 - 20}px;top:${r.top + r.height / 2 - 20}px;width:40px;height:40px;` +
    "border-radius:50%;background:rgba(110,24,40,.45);pointer-events:none;z-index:2147483647;" +
    "transition:transform 400ms ease-out,opacity 400ms ease-out;transform:scale(.3);opacity:1";
  document.body.appendChild(dot);
  requestAnimationFrame(() => { dot.style.transform = "scale(1.6)"; dot.style.opacity = "0"; });
  setTimeout(() => dot.remove(), 400);
}

window.addEventListener("message", (event) => {
  if (event.origin !== ALLOWED_ORIGIN && event.source !== window) return;
  const msg = event.data as DriverMessage | null;
  if (!msg || msg.sim !== "act" || typeof msg.id !== "string" || !msg.action) return;
  const target = event.source as Window | null;
  void runAction(document, msg.action, { onTap: ripple }).then((result) => {
    target?.postMessage({ sim: "done", id: msg.id, result } satisfies DriverMessage, "*");
  });
});

// Announce the screen on load and after client-side navigations, so the runner knows it changed.
let lastPath: string | null = null;
function announce() {
  const path = location.pathname + location.search;
  if (path === lastPath) return;
  lastPath = path;
  window.parent.postMessage({ sim: "ready", path } satisfies DriverMessage, "*");
}
for (const name of ["pushState", "replaceState"] as const) {
  const orig = history[name];
  history[name] = function (this: History, ...args: Parameters<History["pushState"]>) {
    const r = orig.apply(this, args);
    setTimeout(announce, 0);
    return r;
  } as History["pushState"];
}
window.addEventListener("popstate", () => setTimeout(announce, 0));
announce();
