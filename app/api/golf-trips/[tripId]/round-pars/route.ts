import { NextResponse } from "next/server";
import { getGolfTrip } from "@/lib/platform/golfTripsServer";
import { parsFromForm } from "@/lib/platform/tripRoundPars";
import { confirmRoundPars, loadRoundCoursePars, setGroupStartHole } from "@/lib/platform/tripRoundParsServer";
import { getTripRoundScoring } from "@/lib/platform/tripScoringServer";

/**
 * H5C Part 1 — Trip Settings → a round → Course Yardage → Round pars (organizer only).
 * GET ?round=N: the round's course + tee from Trip Settings with its pars (course library / OpenGolf), the confirmed
 * snapshot, and the round's scoring groups with their starting holes.
 * POST { action: "confirm", round, pars, source } — "course" pars are loaded again here and must match exactly (so the
 * label is true); anything typed or edited is "manual". POST { action: "start-hole", round, groupId, startHole }.
 *
 * APP STORE READINESS BLOCKER (2026-10-21): like the other trip API routes, this one trusts a browser session cookie
 * and refuses any request whose Origin isn't this website. A native Capacitor app (capacitor://localhost /
 * https://localhost) can't call it as it stands. The fix must be a native-compatible API contract (e.g. token auth
 * and an allowed native origin), NOT making the native app load the hosted website.
 */
const headers = { "Cache-Control": "private, no-store" };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function organizerTrip(tripId: string) {
  const view = await getGolfTrip(tripId);
  return view.status === "ok" && view.viewer.isOrganizer ? view : null;
}
const roundOf = (value: unknown, count: number) => (typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= count ? value : null);

export async function GET(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const view = await organizerTrip(tripId);
  if (!view) return NextResponse.json({ error: "Trip not found." }, { status: 404, headers });
  const round = roundOf(Number(new URL(request.url).searchParams.get("round")), view.trip.rounds.length);
  if (!round) return NextResponse.json({ error: "Round not found." }, { status: 404, headers });
  const [course, scoring] = await Promise.all([loadRoundCoursePars(view.trip, round), getTripRoundScoring(view.viewer.profileId, tripId, round)]);
  const live = scoring && scoring !== "failed" ? scoring : null;
  return NextResponse.json({
    round, courseName: view.trip.rounds.find((r) => r.roundNumber === round)?.courseName ?? null, course,
    // undefined = golf_trip_round_pars.sql isn't installed yet: the page says so instead of offering a save that fails.
    installed: live ? live.pars !== undefined : false,
    snapshot: live?.pars ?? null,
    scored: live ? live.entries.length > 0 : false,
    groups: (live?.groups ?? []).map((g) => ({ id: g.id, groupNumber: g.groupNumber, startHole: g.startHole ?? 1, locked: g.lockedAt !== null, players: g.players.map((p) => p.displayName) })),
  }, { headers });
}

export async function POST(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  if (request.headers.get("origin") !== new URL(request.url).origin) return NextResponse.json({ error: "Invalid origin." }, { status: 403, headers });
  const { tripId } = await params;
  const view = await organizerTrip(tripId);
  if (!view) return NextResponse.json({ error: "Trip not found." }, { status: 404, headers });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const round = roundOf(body?.round, view.trip.rounds.length);
  if (!body || !round) return NextResponse.json({ error: "Round not found." }, { status: 404, headers });

  if (body.action === "start-hole") {
    const startHole = body.startHole;
    if (typeof body.groupId !== "string" || !UUID.test(body.groupId) || typeof startHole !== "number" || !Number.isInteger(startHole) || startHole < 1 || startHole > 18)
      return NextResponse.json({ error: "Choose a starting hole from 1 to 18." }, { status: 400, headers });
    const saved = await setGroupStartHole(view.viewer.profileId, tripId, body.groupId, startHole);
    if (saved === "failed") return NextResponse.json({ error: "Couldn't save the starting hole. Try again." }, { status: 503, headers });
    return saved ? NextResponse.json({ ok: true }, { headers }) : NextResponse.json({ error: "That group has already started scoring." }, { status: 409, headers });
  }

  if (body.action !== "confirm" || (body.source !== "course" && body.source !== "manual") || !Array.isArray(body.pars))
    return NextResponse.json({ error: "Invalid request." }, { status: 400, headers });
  const form = parsFromForm(body.pars as (string | number | null)[]);
  if (!form.ok) return NextResponse.json({ error: form.error }, { status: 400, headers });
  const roundCourse = view.trip.rounds.find((r) => r.roundNumber === round)?.courseName ?? null;
  let meta = { ref: null as string | null, name: roundCourse, tee: null as string | null };
  if (body.source === "course") {
    const course = await loadRoundCoursePars(view.trip, round);
    if (course.status !== "ok") return NextResponse.json({ error: "This round's course scorecard isn't available. Enter the pars by hand." }, { status: 409, headers });
    if (course.pars.some((par, i) => par !== form.pars[i])) return NextResponse.json({ error: "The course scorecard changed. Reload the pars and check them again." }, { status: 409, headers });
    meta = { ref: course.ref, name: course.name, tee: course.tee };
  }
  const saved = await confirmRoundPars(view.viewer.profileId, tripId, round, form.pars, body.source, meta);
  if (saved === "failed") return NextResponse.json({ error: "Couldn't save the pars. Try again." }, { status: 503, headers });
  return saved ? NextResponse.json({ ok: true }, { headers }) : NextResponse.json({ error: "Pars can't change after scoring starts." }, { status: 409, headers });
}
