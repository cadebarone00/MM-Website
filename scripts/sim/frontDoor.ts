import http from "node:http";
import net from "node:net";
import path from "node:path";
import { build } from "esbuild";
import type { AddressInfo } from "node:net";
import { startFakeSupabase } from "../fake-supabase.mjs";
import type { FakeCall, FakeSupabase } from "../fake-supabase.mjs";
import { scenarioById } from "../../lib/dev/sim/scenarios";
import { SimLog, loginPage, personFromHost } from "../../lib/dev/sim/frontDoor";
import { playChecks, hostsNewestRound } from "../../lib/dev/sim/checks/play";
import { seedSetup } from "../../lib/dev/sim/studio/seedSetup";
import { SAMPLE_COURSES } from "../../lib/dev/sim/studio/courses";
import { validateSetup, type StudioSetup } from "../../lib/dev/sim/studio/setup";
import type { SimCheck, SimCheckResult, SimScenario, SimSeeded } from "../../lib/dev/sim/types";

export type FakeHolder = { current: FakeSupabase };

/**
 * The front door: each phone is <person>.localhost:<port>. It signs that host in as its person,
 * proxies everything else to the sim app, logs calls, and serves /__sim/* to the control page.
 *
 * At startup it takes the clean base snapshot of `fake.current` and restarts the fake from it on
 * the same port so that every fake call lands in this door's log. `fake.current` is replaced
 * whenever the database is restored, so never cache it.
 */
export async function startFrontDoor({ port, appPort, fake, controlOrigin = "http://localhost:3001" }: {
  port: number;
  appPort: number;
  fake: FakeHolder;
  controlOrigin?: string;
}): Promise<{ close(): Promise<void>; log: SimLog; port: number }> {
  const log = new SimLog();
  // The phone driver: bundled once now, served to every phone at /__sim/driver.js.
  const driverJs = (await build({
    entryPoints: [path.resolve(process.cwd(), "lib/dev/sim/driver/client.ts")],
    bundle: true, write: false, format: "iife", platform: "browser",
    define: { __SIM_CONTROL_ORIGIN__: JSON.stringify(controlOrigin) },
  })).outputFiles[0].text;
  const DRIVER_TAG = '<script src="/__sim/driver.js" defer></script>';
  // The fake reports the auth user id of each call; map it to this scenario's person key.
  const onCall = (c: FakeCall) =>
    log.add({ person: (c.user && seeded?.people.find((p) => p.id === c.user)?.key) || null, kind: c.kind, text: c.error ? `${c.name}: ${c.error}` : c.name, ok: c.kind === "unsupported" ? false : c.ok });

  const base = await fake.current.dump();
  let scenario: SimScenario | null = null;
  // What is on screen: a built-in scenario, or a setup made in the Studio. `makeChecks` builds a fresh set each time the
  // database goes back to its start (a custom setup's checks remember which round they follow).
  let setup: StudioSetup | null = null;
  let active: string | null = null;
  let makeChecks: () => SimCheck[] = () => [];
  let checks: SimCheck[] = [];
  let seeded: SimSeeded | null = null;
  let scenarioSnap: Blob | null = null;
  let busy: Promise<unknown> = Promise.resolve();

  async function restore(snapshot: Blob) {
    const p = Number(new URL(fake.current.url).port);
    await fake.current.close();
    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const next = await startFakeSupabase({ port: p, loadDataDir: snapshot, onCall });
        await next.restoreTokens();
        fake.current = next;
        return;
      } catch (e) { lastError = e; }
    }
    const msg = lastError instanceof Error ? lastError.message : String(lastError);
    log.add({ person: null, kind: "note", text: `Could not restart the fake database: ${msg}`, ok: false });
    throw new Error(`Could not restart the fake database: ${msg}`);
  }
  // Hook our log into the fake that was handed in.
  await restore(base);

  // One database change at a time; reads wait for it to finish.
  const serialize = <T,>(fn: () => Promise<T>): Promise<T> => {
    const run = busy.then(fn, fn);
    busy = run.catch(() => undefined);
    return run;
  };

  // Per person: every page (document navigation) the phone loaded, oldest first, capped. Shown by the control page as
  // each phone's address bar and Back button. Cleared whenever the scenario changes or is reset.
  const HISTORY_CAP = 50;
  let history = new Map<string, string[]>();
  const recordPage = (person: string, path: string) => {
    const list = history.get(person) ?? [];
    if (list[list.length - 1] === path) return; // a reload, or the page Back just returned to
    list.push(path);
    if (list.length > HISTORY_CAP) list.shift();
    history.set(person, list);
  };
  const pagesNow = () => Object.fromEntries([...history].map(([person, list]) => [person, { path: list[list.length - 1] ?? "/", history: list }]));

  const status = () => ({
    ok: true,
    scenario: active,
    setup,
    roles: setup ? Object.fromEntries(setup.players.map((p) => [p.key, p.key === setup!.host ? "Host" : "Player"])) : {},
    phones: seeded?.phones ?? [],
    people: (seeded?.people ?? []).map((p) => ({ key: p.key, name: p.name })),
    pages: pagesNow(),
  });

  const cors = (res: http.ServerResponse) => {
    res.setHeader("Access-Control-Allow-Origin", controlOrigin);
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "content-type");
    res.setHeader("Vary", "Origin");
  };
  const json = (res: http.ServerResponse, code: number, body: unknown) => {
    res.writeHead(code, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  };
  const readBody = (req: http.IncomingMessage) =>
    new Promise<string>((resolve) => {
      let s = "";
      req.on("data", (c) => (s += c));
      req.on("end", () => resolve(s));
    });

  async function handleSim(req: http.IncomingMessage, res: http.ServerResponse, url: URL) {
    cors(res);
    if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }
    if (req.method === "POST" && req.headers.origin && req.headers.origin !== controlOrigin) {
      return json(res, 403, { ok: false, error: "Origin not allowed" });
    }
    const route = url.pathname;
    try {
      if (route === "/__sim/login" && req.method === "GET") {
        const as = url.searchParams.get("as") ?? "";
        const host = personFromHost(req.headers.host ?? "");
        const cookie = await serialize(async () => {
          const user = seeded?.people.find((p) => p.key === as);
          return user && as === host ? fake.current.sessionCookie(user) : null;
        });
        if (!cookie) return json(res, 400, { ok: false, error: "Not this phone's person" });
        res.writeHead(200, {
          "Content-Type": "text/html; charset=utf-8",
          "Set-Cookie": `${cookie.name}=${cookie.value}; Path=/; SameSite=Lax`,
          "Cache-Control": "no-store",
        });
        res.end(loginPage(url.searchParams.get("next") ?? "/"));
        return;
      }
      if (route === "/__sim/driver.js" && req.method === "GET") {
        res.writeHead(200, { "Content-Type": "application/javascript; charset=utf-8", "Cache-Control": "no-store" });
        res.end(driverJs);
        return;
      }
      if (route === "/__sim/status" && req.method === "GET") { await busy; return json(res, 200, status()); }
      if (route === "/__sim/log" && req.method === "GET") {
        return json(res, 200, log.since(Number(url.searchParams.get("since") ?? 0) || 0));
      }
      if (route === "/__sim/checks" && req.method === "GET") {
        const out = await serialize(async () => {
          const rows: { id: string; label: string; status: string; detail: string }[] = [];
          if (!active || !seeded) return rows;
          for (const c of checks) {
            let r: SimCheckResult;
            try { r = await c.run(fake.current.db, seeded); }
            catch (e) { r = { status: "fail", detail: e instanceof Error ? e.message : String(e) }; }
            rows.push({ id: c.id, label: c.label, status: r.status, detail: r.detail });
          }
          return rows;
        });
        return json(res, 200, out);
      }
      if (route === "/__sim/scenario" && req.method === "POST") {
        let id = "";
        try { id = JSON.parse((await readBody(req)) || "{}").id ?? ""; } catch { /* bad json: treated as unknown */ }
        const next = scenarioById(id);
        if (!next) return json(res, 400, { ok: false, error: `Unknown scenario: ${id}` });
        await serialize(async () => {
          scenario = null; setup = null; active = null; checks = []; seeded = null; scenarioSnap = null; history = new Map();
          await restore(base);
          seeded = await next.seed(fake.current);
          scenario = next; active = next.id; makeChecks = () => next.checks; checks = makeChecks();
          scenarioSnap = await fake.current.dump();
          log.add({ person: null, kind: "note", text: `Scenario: ${next.label}`, ok: true });
        });
        return json(res, 200, status());
      }
      if (route === "/__sim/custom" && req.method === "POST") {
        let next: StudioSetup | null = null;
        try { next = JSON.parse((await readBody(req)) || "{}").setup ?? null; } catch { /* bad json: treated as missing */ }
        const problem = !next || typeof next !== "object" || !Array.isArray(next.players) ? "Send a setup to start from." : validateSetup(next);
        if (problem || !next) return json(res, 400, { ok: false, error: problem });
        const chosen = next;
        const tee = SAMPLE_COURSES.find((c) => c.ref === chosen.course)?.tees.find((t) => t.name === chosen.tee);
        await serialize(async () => {
          scenario = null; setup = null; active = null; checks = []; seeded = null; scenarioSnap = null; history = new Map();
          await restore(base);
          seeded = await seedSetup(fake.current, chosen);
          setup = chosen; active = "custom";
          makeChecks = () => playChecks({ expectCounted: tee?.rating != null, withGuest: !!chosen.guest, round: hostsNewestRound() });
          checks = makeChecks();
          scenarioSnap = await fake.current.dump();
          log.add({ person: null, kind: "note", text: "Custom setup started", ok: true });
        });
        return json(res, 200, status());
      }
      if (route === "/__sim/reset" && req.method === "POST") {
        if (!scenarioSnap) return json(res, 400, { ok: false, error: "No scenario chosen yet" });
        const snap = scenarioSnap;
        await serialize(async () => {
          await restore(snap);
          checks = makeChecks();
          history = new Map();
          log.add({ person: null, kind: "note", text: "Reset to the start", ok: true });
        });
        return json(res, 200, status());
      }
      if (route === "/__sim/back" && req.method === "POST") {
        // Pops the phone's current page off its history and answers with the page to go back to (or null).
        let person = "";
        try { person = JSON.parse((await readBody(req)) || "{}").person ?? ""; } catch { /* treated as unknown */ }
        const list = history.get(person) ?? [];
        if (list.length < 2) return json(res, 200, { ok: true, path: null });
        list.pop();
        return json(res, 200, { ok: true, path: list[list.length - 1] });
      }
      json(res, 404, { ok: false, error: "Not found" });
    } catch (e) {
      json(res, 500, { ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  }

  const withDriver = (html: string) => {
    const head = html.search(/<\/head>/i);
    if (head >= 0) return html.slice(0, head) + DRIVER_TAG + html.slice(head);
    const body = html.search(/<body[^>]*>/i);
    if (body >= 0) { const end = html.indexOf(">", body) + 1; return html.slice(0, end) + DRIVER_TAG + html.slice(end); }
    return html + DRIVER_TAG;
  };

  async function proxy(req: http.IncomingMessage, res: http.ServerResponse, url: URL) {
    const person = personFromHost(req.headers.host ?? "");
    const isApi = url.pathname.startsWith("/api/");
    const origHost = req.headers.host ?? `localhost:${port}`;
    await busy; // never forward while the database is being swapped
    // Phones sit in iframes on another site, so browsers will not send them a cookie. Sign the phone in here instead: put
    // its person's session in every request. A host that is not in the current scenario is forwarded as it came.
    const user = person ? seeded?.people.find((p) => p.key === person) : undefined;
    const cookie = user ? fake.current.sessionCookie(user) : null;
    const outgoing = { ...req.headers };
    if (cookie) {
      const others = (req.headers.cookie ?? "").split(";").map((c) => c.trim()).filter((c) => c && !c.startsWith(`${cookie.name}=`));
      outgoing.cookie = [...others, `${cookie.name}=${cookie.value}`].join("; ");
    }
    // A page is a document/iframe load, or a Next app-router navigation (GET with `rsc: 1`, not a prefetch); the _rsc param is dropped.
    const isNav = ["document", "iframe"].includes(String(req.headers["sec-fetch-dest"] ?? ""));
    const isRsc = req.headers.rsc === "1" && !req.headers["next-router-prefetch"];
    const isPage = person && req.method === "GET" && (isNav || isRsc) && !url.pathname.startsWith("/_next");
    const pageKey = (() => { const q = new URLSearchParams(url.search); q.delete("_rsc"); const s = q.toString(); return url.pathname + (s ? `?${s}` : ""); })();
    // Plain GETs from a phone may be HTML pages: ask for them uncompressed so the driver tag can be inserted.
    const mayInject = !!person && req.method === "GET" && isNav && !isRsc && !isApi && !url.pathname.startsWith("/_next");
    if (mayInject) outgoing["accept-encoding"] = "identity";
    const up = http.request(
      {
        host: "localhost", port: appPort, method: req.method, path: req.url,
        headers: { ...outgoing, host: `localhost:${appPort}`, "x-forwarded-host": origHost, "x-forwarded-proto": "http" },
      },
      (r) => {
        if (isPage && (r.statusCode ?? 0) < 300) recordPage(person!, pageKey);
        if (isApi) {
          const code = r.statusCode ?? 0;
          log.add({ person, kind: "api", text: `${req.method} ${url.pathname} → ${code}`, ok: code < 400 });
        }
        const headers = { ...r.headers };
        const loc = headers.location;
        if (typeof loc === "string") {
          for (const own of [`http://localhost:${appPort}`, `http://127.0.0.1:${appPort}`]) {
            if (loc.startsWith(own)) { headers.location = `http://${origHost}${loc.slice(own.length)}`; break; }
          }
        }
        const type = String(r.headers["content-type"] ?? "");
        if (mayInject && r.statusCode === 200 && /^text\/html/i.test(type) && !r.headers["content-encoding"]) {
          const chunks: Buffer[] = [];
          r.on("data", (c: Buffer) => chunks.push(c));
          r.on("end", () => {
            const html = withDriver(Buffer.concat(chunks).toString("utf8"));
            const body = Buffer.from(html, "utf8");
            delete headers["transfer-encoding"];
            headers["content-length"] = String(body.length);
            res.writeHead(200, headers);
            res.end(body);
          });
          r.on("error", () => res.destroy());
          return;
        }
        res.writeHead(r.statusCode ?? 502, headers);
        r.pipe(res);
      },
    );
    res.on("close", () => { if (!res.writableFinished) up.destroy(); });
    up.on("error", (e) => {
      if (isApi) log.add({ person, kind: "api", text: `${req.method} ${url.pathname} → app unreachable`, ok: false });
      if (res.headersSent) { res.destroy(); return; }
      res.writeHead(502, { "Content-Type": "text/plain" });
      res.end(`Sim app unreachable: ${e.message}`);
    });
    req.pipe(up);
  }

  const sockets = new Set<net.Socket>();
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://x");
    if (url.pathname.startsWith("/__sim/")) void handleSim(req, res, url);
    else void proxy(req, res, url);
  });
  server.on("connection", (s) => { sockets.add(s); s.on("close", () => sockets.delete(s)); });
  // Websockets (live reload): replay the handshake to the app, then pipe both ways.
  server.on("upgrade", (req, socket, head) => {
    const up = net.connect(appPort, "localhost", () => {
      const lines = [`${req.method} ${req.url} HTTP/1.1`];
      const h = req.rawHeaders;
      for (let i = 0; i < h.length; i += 2) lines.push(`${h[i]}: ${h[i].toLowerCase() === "host" ? `localhost:${appPort}` : h[i + 1]}`);
      up.write(lines.join("\r\n") + "\r\n\r\n");
      if (head.length) up.write(head);
      up.pipe(socket);
      socket.pipe(up);
    });
    up.on("error", () => socket.destroy());
    up.on("close", () => socket.destroy());
    socket.on("error", () => up.destroy());
    socket.on("close", () => up.destroy());
    sockets.add(up);
    up.on("close", () => sockets.delete(up));
  });
  await new Promise<void>((resolve) => server.listen(port, resolve));

  return {
    log,
    port: (server.address() as AddressInfo).port,
    close: async () => {
      await busy;
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
        for (const s of sockets) s.destroy();
      });
    },
  };
}
