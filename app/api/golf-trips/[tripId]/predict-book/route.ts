import { NextResponse } from "next/server";
import { getGolfTrip } from "@/lib/platform/golfTripsServer";
import { parseBook, parseTrade, type SaveResult } from "@/lib/platform/predictBook";
import { importWallet, loadWallet, tradeWallet } from "@/lib/platform/predictBookServer";

/**
 * My Predict wallet for one trip (play-only Maroon Coins), members only, website or app login:
 *   GET /api/golf-trips/<trip>/predict-book  → { book, version }          (version 0 = fresh 1,000-coin wallet)
 *   PUT /api/golf-trips/<trip>/predict-book  { version, trade }            one buy or sell
 *                                            { version: 0, import: book }  one-time move of this device's wallet
 * 409 { book, version } = changed on another device (show this wallet and try again); 503 = not switched on yet.
 */
type Params = { params: Promise<{ tripId: string }> };
const noStore = { "Cache-Control": "private, no-store" };
async function member(params: Params["params"]) {
  const { tripId } = await params;
  const view = await getGolfTrip(tripId);
  return view.status === "ok" ? { tripId, profileId: view.viewer.profileId }
    : { error: NextResponse.json({ error: "Trip not found." }, { status: view.status === "signed-out" ? 401 : 404 }) };
}
const offline = () => NextResponse.json({ error: "Predict on the account isn't switched on yet." }, { status: 503, headers: noStore });

export async function GET(_request: Request, { params }: Params) {
  const who = await member(params);
  if ("error" in who) return who.error;
  const wallet = await loadWallet(who.tripId, who.profileId);
  if (wallet === "not_installed") return offline();
  if (wallet === "failed") return NextResponse.json({ error: "Couldn't load your coins. Try again." }, { status: 500, headers: noStore });
  return NextResponse.json(wallet, { headers: noStore });
}

export async function PUT(request: Request, { params }: Params) {
  const who = await member(params);
  if ("error" in who) return who.error;
  const body = (await request.json().catch(() => null)) as { version?: unknown; trade?: unknown; import?: unknown } | null;
  const version = body?.version;
  if (!Number.isInteger(version) || (version as number) < 0) return NextResponse.json({ error: "Missing wallet version." }, { status: 400 });
  let result: SaveResult;
  if (body?.import !== undefined) {
    const book = parseBook(body.import);
    if (!book || version !== 0) return NextResponse.json({ error: "That wallet can't be moved over." }, { status: 400 });
    result = await importWallet(who.tripId, who.profileId, book);
  } else {
    const trade = parseTrade(body?.trade);
    if (!trade) return NextResponse.json({ error: "That pick isn't valid." }, { status: 400 });
    result = await tradeWallet(who.tripId, who.profileId, version as number, trade);
  }
  if (result.ok) return NextResponse.json(result.wallet, { headers: noStore });
  if (result.code === "conflict") return NextResponse.json({ error: "Your coins changed on another device.", ...result.wallet }, { status: 409, headers: noStore });
  if (result.code === "refused") return NextResponse.json({ error: result.message }, { status: 400, headers: noStore });
  if (result.code === "not_installed") return offline();
  return NextResponse.json({ error: "Couldn't save your pick. Try again." }, { status: 500, headers: noStore });
}
