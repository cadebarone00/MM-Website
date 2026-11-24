// TEST INFRASTRUCTURE ONLY — never used by the app itself.
//
// A stand-in for the Supabase HTTP API so a real production build of the app
// can be driven end to end in a browser without touching the real database.
// It runs every supabase/*.sql migration in an in-memory Postgres (PGlite) and
// answers the few kinds of request the app makes:
//   GET  /auth/v1/user                    who owns this access token
//   POST /rest/v1/rpc/<function>          call a database function
//   GET  /rest/v1/<table>?select&filters  simple reads (eq, neq, in, is, gt/gte/lt/lte, cs, order, limit/offset)
// Anything else answers with a PostgREST-style error, so unsupported calls
// fail loudly in the test log instead of silently succeeding.
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";

export const MIGRATIONS = [
  "schema.sql", "career_live_archive.sql", "course_library_location.sql", "course_library_tee_setups.sql", "archived_handicap_tees.sql",
  "live_match_publication.sql", "live_hole_submissions.sql", "hole_shot_directions.sql", "hole_shot_directions_penalty.sql",
  "round_format_setups.sql", "scoring_reliability.sql", "live_round_submission.sql", "broadcast_countdown.sql", "broadcast_player_video.sql",
  "hole_in_one_future.sql", "low_individual_future.sql", "player_birdies_future.sql", "player_doubles_future.sql", "player_slots_email.sql",
  "player_slots_full_name.sql", "player_slots_password_created.sql", "refund_unsettleable_mm_coin_bets.sql", "season_calendar.sql",
  "session_count_lock.sql", "session_tee_times.sql", "team_winner_future.sql", "total_birdies_future.sql", "tournament_timezone.sql",
  "website_section_settings.sql", "team_winner_auto_pricing.sql", "platform_foundation.sql", "platform_editions.sql",
  "platform_create_tournament.sql", "platform_dashboard.sql", "platform_public_site.sql", "platform_access_requests.sql", "platform_past_editions.sql", "platform_active_editions.sql", "platform_activity.sql",
  "golf_trips.sql", "golf_trip_setup.sql", "golf_trip_flights.sql", "profile_identity.sql", "player_rounds.sql", "golf_trip_invitations.sql", "tournament_player_identity.sql", "platform_next_edition.sql", "profile_read_model.sql", "profile_v1.sql", "legacy_round_import.sql", "historical_import.sql",
];

const IDENT = /^[a-z_][a-z0-9_]*$/;
const PG_STATUS = { "42501": 403, "23505": 409, "23503": 409, "PGRST116": 406 };

export async function startFakeSupabase({ port, root = "supabase", migrations = MIGRATIONS, loadDataDir, onCall } = {}) {
  // A restored data directory already holds the roles, schemas and every migration.
  const db = loadDataDir ? new PGlite({ loadDataDir }) : new PGlite();
  if (!loadDataDir) {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create schema auth; create table auth.users(id uuid primary key, email text, encrypted_password text);
      create function auth.uid() returns uuid language sql as $$select null::uuid$$;
      create schema storage; create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
      create publication supabase_realtime;`);
    for (const file of migrations) await db.exec(readFileSync(`${root}/${file}`, "utf8"));
  }

  const tokens = new Map(); // access token -> user
  const unsupported = [];

  /** Adds a login: auth user + profile. Returns { id, token, email }. */
  async function addUser({ name, platformRole = null, approved = false, isHost = false }) {
    const id = randomUUID();
    const email = `${name}@example.test`;
    await db.query("insert into auth.users(id, email) values ($1, $2)", [id, email]);
    await db.query("insert into profiles(id, email, display_name, username, platform_role, is_host) values ($1,$2,$3,$4,$5,$6)", [id, email, name, name, platformRole, isHost]);
    if (approved) await db.query("insert into tournament_creator_access(profile_id, status) values ($1, 'approved')", [id]);
    const token = `test-token-${id}`;
    tokens.set(token, { id, email, aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() });
    return { id, token, email };
  }

  /** Rebuilds the token map from auth.users (tokens are always test-token-<id>), e.g. after loading a dump. */
  async function restoreTokens() {
    tokens.clear();
    for (const { id, email } of (await db.query("select id, email from auth.users")).rows) {
      tokens.set(`test-token-${id}`, { id, email, aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() });
    }
  }

  const send = (res, status, body, headers = {}) => {
    res.fakeStatus = status;
    res.fakeError = status >= 400 && body && typeof body === "object" ? (body.message ?? body.msg ?? String(status)) : undefined;
    res.writeHead(status, { "Content-Type": "application/json", ...headers });
    res.end(body === undefined ? "" : JSON.stringify(body));
  };
  const pgError = (res, error) => send(res, PG_STATUS[error.code] ?? 400, { code: error.code ?? "XX000", message: error.message, details: null, hint: error.hint ?? null });

  function parseValue(raw) {
    const value = decodeURIComponent(raw);
    return value.startsWith('"') && value.endsWith('"') ? value.slice(1, -1) : value;
  }

  function buildFilter(column, expression, params) {
    if (!IDENT.test(column)) throw Object.assign(new Error(`bad column ${column}`), { code: "PGRST100" });
    let negate = false;
    let expr = expression;
    if (expr.startsWith("not.")) { negate = true; expr = expr.slice(4); }
    const dot = expr.indexOf(".");
    const op = expr.slice(0, dot);
    const operand = expr.slice(dot + 1);
    let sql;
    if (op === "is") sql = `"${column}" is ${operand === "null" ? "null" : operand === "true" ? "true" : "false"}`;
    else if (op === "in") {
      const items = operand.replace(/^\(|\)$/g, "").split(",").filter(Boolean).map(parseValue);
      params.push(items);
      sql = `"${column}"::text = any($${params.length}::text[])`;
    } else if (op === "cs") {
      params.push(parseValue(operand));
      sql = `"${column}" @> $${params.length}`;
    } else {
      const ops = { eq: "=", neq: "<>", gt: ">", gte: ">=", lt: "<", lte: "<=", like: "like", ilike: "ilike" };
      if (!ops[op]) throw Object.assign(new Error(`unsupported filter ${op}`), { code: "PGRST100" });
      // like/ilike patterns hold a literal %, which parseValue's second decode would reject.
      params.push(op === "like" || op === "ilike" ? operand : parseValue(operand));
      sql = `"${column}" ${ops[op]} $${params.length}`;
    }
    return negate ? `not (${sql})` : sql;
  }

  /** `or=(col.op.value,col.op.value)`: plain filters joined by OR (no nested and/or, no commas inside a value). */
  function orFilter(expression, params) {
    const unsupportedOr = () => Object.assign(new Error(`unsupported or filter ${expression}`), { code: "PGRST100", unsupportedOr: true });
    const inner = expression.match(/^\((.*)\)$/)?.[1];
    // Nested and/or, quoted values (which may hold commas) and anything else fancier answer red.
    if (!inner || /[()"]/.test(inner)) throw unsupportedOr();
    const parts = inner.split(",").map((part) => {
      const dot = part.indexOf(".");
      if (dot < 1) throw unsupportedOr();
      return buildFilter(part.slice(0, dot), part.slice(dot + 1), params);
    });
    return `(${parts.join(" or ")})`;
  }

  const notSupported = () => Object.assign(new Error("unsupported select"), { unsupported: true });

  /**
   * The select list as SQL. Plain columns, "*", and one level of child tables as "child(col, col)" (each child table has a
   * single-column foreign key to this table; it comes back as a JSON array, [] when there are none). Everything else
   * (aliases, !hints, nesting, parent-side embeds) is unsupported and answers red.
   */
  async function selectList(table, select) {
    if (select === "*") return "*";
    const items = [];
    let depth = 0, current = "";
    for (const ch of select) {
      if (ch === "(") depth++;
      if (ch === ")") depth--;
      if (ch === "," && depth === 0) { items.push(current); current = ""; } else current += ch;
    }
    items.push(current);
    const out = [];
    for (const raw of items.map((i) => i.trim()).filter(Boolean)) {
      const embed = raw.match(/^([a-z_][a-z0-9_]*)\(([^()]*)\)$/);
      if (embed) {
        const [, child, inner] = embed;
        const cols = inner.split(",").map((c) => c.trim()).filter(Boolean);
        if (!cols.length || cols.some((c) => !IDENT.test(c))) throw notSupported();
        const fks = (await db.query(
          `select a.attname as col from pg_constraint k join pg_attribute a on a.attrelid = k.conrelid and a.attnum = k.conkey[1]
           where k.contype = 'f' and k.conrelid = $1::regclass and k.confrelid = $2::regclass and array_length(k.conkey, 1) = 1`,
          [`public."${child}"`, `public."${table}"`]).catch(() => ({ rows: [] }))).rows;
        if (fks.length !== 1) throw notSupported();
        const pk = (await db.query(
          `select a.attname as col from pg_constraint k join pg_attribute a on a.attrelid = k.conrelid and a.attnum = k.conkey[1]
           where k.contype = 'p' and k.conrelid = $1::regclass and array_length(k.conkey, 1) = 1`, [`public."${table}"`])).rows;
        if (pk.length !== 1) throw notSupported();
        const pairs = cols.map((c) => `'${c}', c."${c}"`).join(", ");
        out.push(`coalesce((select json_agg(json_build_object(${pairs})) from public."${child}" c where c."${fks[0].col}" = public."${table}"."${pk[0].col}"), '[]'::json) as "${child}"`);
      } else {
        if (!IDENT.test(raw)) throw notSupported();
        out.push(`"${raw}"`);
      }
    }
    return out.join(", ");
  }

  async function handleTable(req, res, table, url) {
    if (req.method !== "GET" && req.method !== "HEAD") {
      unsupported.push(`${req.method} ${table}`); res.fakeUnsupported = `${req.method} ${table}`;
      return send(res, 501, { code: "PGRST501", message: `fake-supabase: ${req.method} on tables isn't supported` });
    }
    const select = url.searchParams.get("select") ?? "*";
    let columns;
    try { columns = await selectList(table, select); }
    catch (error) {
      if (!error.unsupported) throw error;
      unsupported.push(`embedded select on ${table}: ${select}`); res.fakeUnsupported = `embedded select on ${table}: ${select}`;
      return send(res, 400, { code: "PGRST100", message: "fake-supabase: this embedded select isn't supported" });
    }
    const params = [];
    const where = [];
    let order = "";
    let limit = null;
    let offset = null;
    for (const [key, value] of url.searchParams) {
      if (key === "select") continue;
      if (key === "order") {
        order = " order by " + value.split(",").map((part) => {
          const [col, ...mods] = part.split(".");
          if (!IDENT.test(col)) throw new Error(`bad order ${col}`);
          return `"${col}" ${mods.includes("desc") ? "desc" : "asc"}${mods.includes("nullsfirst") ? " nulls first" : mods.includes("nullslast") ? " nulls last" : ""}`;
        }).join(", ");
      } else if (key === "limit") limit = Number(value);
      else if (key === "offset") offset = Number(value);
      else if (key === "or") {
        try { where.push(orFilter(value, params)); }
        catch (error) {
          if (!error.unsupportedOr) throw error;
          unsupported.push(`or filter on ${table}: ${value}`); res.fakeUnsupported = `or filter on ${table}: ${value}`;
          return send(res, 400, { code: "PGRST100", message: "fake-supabase: this or filter isn't supported" });
        }
      }
      else where.push(buildFilter(key, value, params));
    }
    const range = req.headers.range?.match(/^(\d+)-(\d+)$/);
    if (range) { offset = Number(range[1]); limit = Number(range[2]) - Number(range[1]) + 1; }
    const whereSql = where.length ? ` where ${where.join(" and ")}` : "";
    const result = await db.query(`select ${columns} from public."${table}"${whereSql}${order}${limit !== null ? ` limit ${limit}` : ""}${offset !== null ? ` offset ${offset}` : ""}`, params);
    const headers = {};
    if (/count=exact/.test(req.headers.prefer ?? "")) {
      const total = (await db.query(`select count(*)::int n from public."${table}"${whereSql}`, params)).rows[0].n;
      headers["Content-Range"] = `${offset ?? 0}-${(offset ?? 0) + result.rows.length - 1}/${total}`;
    }
    if ((req.headers.accept ?? "").includes("vnd.pgrst.object")) {
      if (result.rows.length !== 1) return send(res, 406, { code: "PGRST116", message: `JSON object requested, ${result.rows.length} rows returned` });
      return send(res, 200, result.rows[0], headers);
    }
    return send(res, 200, req.method === "HEAD" ? undefined : result.rows, headers);
  }

  async function handleRpc(req, res, fn, body) {
    if (!IDENT.test(fn)) return send(res, 404, { code: "PGRST202", message: "not found" });
    const args = body ? JSON.parse(body) : {};
    const names = Object.keys(args);
    for (const name of names) if (!IDENT.test(name)) return send(res, 400, { code: "PGRST100", message: `bad arg ${name}` });
    // PostgREST query params (filters/select/order/limit) on an RPC need set-returning handling this fake doesn't do.
    const rpcParams = [...new URL(req.url, "http://x").searchParams.keys()];
    if (rpcParams.length) {
      const what = `rpc ${fn} with query params (${rpcParams.join(", ")})`;
      unsupported.push(what); res.fakeUnsupported = what;
      return send(res, 400, { code: "PGRST100", message: `fake-supabase: ${what} isn't supported` });
    }
    const sigs = (await db.query(
      "select proretset, proargnames, array(select format_type(t, null) from unnest(proargtypes::oid[]) with ordinality u(t, i) order by i) as types from pg_proc where proname = $1 and pronamespace = 'public'::regnamespace", [fn])).rows;
    if (!sigs.length) return send(res, 404, { code: "PGRST202", message: `Could not find the function public.${fn}` });
    // Pick the overload that has every named argument, to learn each parameter's type.
    const sig = sigs.find((row) => names.every((name) => (row.proargnames ?? []).includes(name))) ?? sigs[0];
    if (sig.proretset) {
      const what = `set-returning rpc ${fn}`;
      unsupported.push(what); res.fakeUnsupported = what;
      return send(res, 400, { code: "PGRST100", message: `fake-supabase: ${what} isn't supported` });
    }
    const typeOf = (name) => sig.types[(sig.proargnames ?? []).indexOf(name)] ?? "";
    // Array parameters (uuid[], text[]...) need a Postgres array literal {a,b}; jsonb/json and plain objects take JSON text.
    const arrayLiteral = (items) => "{" + items.map((item) => (item === null ? "NULL" : '"' + String(item).replace(/[\\"]/g, "\\$&") + '"')).join(",") + "}";
    const values = names.map((name) => {
      const value = args[name];
      if (value === null || typeof value !== "object") return value;
      if (Array.isArray(value) && typeOf(name).endsWith("[]")) return arrayLiteral(value);
      return JSON.stringify(value);
    });
    const call = `select public."${fn}"(${names.map((name, i) => `"${name}" => $${i + 1}`).join(", ")}) as result`;
    try {
      const result = await db.query(call, values);
      return send(res, 200, result.rows[0]?.result ?? null);
    } catch (error) {
      return pgError(res, error);
    }
  }

  const server = createServer(async (req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", async () => {
      let kind = "unsupported";
      let name = `${req.method} ${req.url}`;
      res.on("finish", () => {
        if (!onCall) return;
        if (res.fakeUnsupported) { kind = "unsupported"; name = res.fakeUnsupported; }
        const ok = kind !== "unsupported" && (res.fakeStatus ?? 200) < 400;
        const token = (req.headers.authorization ?? "").replace(/^Bearer /, "");
        const user = tokens.get(token)?.id;
        try { onCall({ at: new Date().toISOString(), kind, name, ok, ...(user ? { user } : {}), ...(ok ? {} : { error: res.fakeError ?? `HTTP ${res.fakeStatus}` }) }); } catch { /* a bad listener must not break the fake */ }
      });
      try {
        const url = new URL(req.url, `http://localhost:${server.address().port}`);
        if (url.pathname === "/auth/v1/user") {
          kind = "auth"; name = "GET /auth/v1/user";
          const token = (req.headers.authorization ?? "").replace(/^Bearer /, "");
          const user = tokens.get(token);
          return user ? send(res, 200, user) : send(res, 401, { code: 401, msg: "invalid token" });
        }
        const rpc = url.pathname.match(/^\/rest\/v1\/rpc\/([^/]+)$/);
        if (rpc) { kind = "rpc"; name = rpc[1]; return await handleRpc(req, res, rpc[1], body); }
        const table = url.pathname.match(/^\/rest\/v1\/([a-z_][a-z0-9_]*)$/);
        if (table) { kind = "table"; name = table[1]; return await handleTable(req, res, table[1], url); }
        unsupported.push(`${req.method} ${url.pathname}`);
        return send(res, 404, { code: "PGRST404", message: `fake-supabase: ${url.pathname} isn't supported` });
      } catch (error) {
        return pgError(res, error);
      }
    });
  });
  // No host: listen on IPv4 and IPv6, since "localhost" may resolve to either.
  await new Promise((resolve) => server.listen(port, resolve));
  const actualPort = server.address().port; // differs from `port` when 0 was passed

  return {
    db,
    url: `http://localhost:${actualPort}`,
    dump: () => db.dumpDataDir(),
    restoreTokens,
    addUser,
    unsupported,
    /** Cookie that makes the app treat the browser as this user. */
    sessionCookie(user) {
      const session = { access_token: user.token, token_type: "bearer", expires_in: 86400, expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: "unused", user: tokens.get(user.token) };
      return { name: "sb-localhost-auth-token", value: "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url") };
    },
    close: () => new Promise((resolve) => server.close(() => db.close().then(resolve))),
  };
}
