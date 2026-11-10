"""
Venue places: the free daily import from Overture Maps Places (project_specs.md "Venue tab -> Places recommendations").

Runs in GitHub Actions (.github/workflows/venue-places.yml), never inside the app. For every upcoming trip's area
(supabase/venue_places.sql place_areas_to_import) whose places are missing or over 30 days old, it reads that area from
Overture's newest release (public files on Amazon storage, read with DuckDB - no account, no cost), keeps our five
categories, drops closed and low-confidence places, and stores them with store_places. Overture's open licences allow
storing; the Venue tab shows "Places data (c) Overture Maps Foundation".

Environment: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (GitHub Actions secrets). Local try-out without a database:
  python scripts/places/import_overture.py --dry-run --at 33.4942,-111.9261
"""
from __future__ import annotations

import argparse
import json
import math
import os
import re
import sys
import time
import urllib.request
from datetime import datetime, timedelta, timezone

BUCKET = "overturemaps-us-west-2"
GRID = 0.05                 # keep in step with lib/platform/placeAreas.ts
REFRESH_DAYS = 30
MIN_CONFIDENCE = 0.7
MAX_PER_CATEGORY = 150
# Town-sized for food / drinks / coffee; wider for golf and things to do.
RADIUS_KM = {"food": 8, "bars": 8, "coffee": 8, "golf": 15, "todo": 15}
CATEGORIES = ("food", "bars", "coffee", "golf", "todo")

# Overture basic_category -> our category. Golf also takes anything with "golf" in its category (ranges, shops).
CATEGORY_OF = {
    **{c: "food" for c in ("restaurant", "casual_eatery", "fast_food_restaurant", "food_court")},
    **{c: "bars" for c in ("bar", "brewery", "winery", "distillery", "nightlife_venue", "alcoholic_beverage_venue")},
    **{c: "coffee" for c in ("coffee_shop", "cafe")},
    "golf_course": "golf",
    **{c: "todo" for c in ("museum", "aquarium", "zoo", "animal_attraction", "amusement_park", "amusement_attraction",
                           "gaming_venue", "music_venue", "performing_arts_venue", "theatre_venue", "casino",
                           "recreational_trail_or_path", "national_park", "arts_and_entertainment")},
}
CLOSED = {"permanently_closed", "temporarily_closed"}


def area_key(latitude: float, longitude: float) -> str:
    """Same ~5 km grid square as lib/platform/placeAreas.ts areaKey (JavaScript Math.round: halves round up)."""
    snap = lambda value: f"{math.floor(value / GRID + 0.5) * GRID:.2f}"
    return f"{snap(latitude)},{snap(longitude)}".replace("-0.00", "0.00")


NOT_A_GOLF_PLACE = ("instructor", "lesson", "school", "coach", "teacher")


def category_for(basic: str | None, taxonomy_primary: str | None) -> str | None:
    labels = f"{basic or ''} {taxonomy_primary or ''}"
    if "golf" in labels:
        # Golf = courses, ranges and shops; not lessons or instructors (owner, 2026-11-03).
        return None if any(word in labels for word in NOT_A_GOLF_PLACE) else "golf"
    return CATEGORY_OF.get(basic or "")


def miles_between(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    rad = math.radians
    a = math.sin(rad(lat2 - lat1) / 2) ** 2 + math.cos(rad(lat1)) * math.cos(rad(lat2)) * math.sin(rad(lon2 - lon1) / 2) ** 2
    return 3958.8 * 2 * math.asin(min(1, math.sqrt(a)))


def needs_refresh(fetched_at: str | None, now: datetime) -> bool:
    if not fetched_at:
        return True
    try:
        when = datetime.fromisoformat(fetched_at.replace("Z", "+00:00"))
    except ValueError:
        return True
    return now - when > timedelta(days=REFRESH_DAYS)


def _clean(value, limit: int) -> str | None:
    text = re.sub(r"\s+", " ", str(value or "")).strip()
    return text[:limit] if text else None


def detail_for(basic: str | None, taxonomy_primary: str | None) -> str | None:
    label = taxonomy_primary or basic
    return _clean(label.replace("_", " ").title(), 120) if label else None


def shape_places(rows, center_lat: float, center_lon: float) -> dict[str, list[dict]]:
    """Overture rows -> { category: [place, ...] }: our categories only, open, confident, inside the category's radius,
    best confidence first, at most MAX_PER_CATEGORY each. Row = (id, name, basic, taxonomy_primary, confidence, street,
    city, website, phone, lat, lon, operating_status)."""
    out: dict[str, list[tuple[float, dict]]] = {c: [] for c in CATEGORIES}
    seen = set()
    for (pid, name, basic, tax, confidence, street, city, website, phone, lat, lon, status) in rows:
        category = category_for(basic, tax)
        name = _clean(name, 120)
        if not category or not name or not pid or pid in seen or lat is None or lon is None:
            continue
        if (confidence or 0) < MIN_CONFIDENCE or (status or "") in CLOSED:
            continue
        if miles_between(center_lat, center_lon, lat, lon) * 1.609344 > RADIUS_KM[category]:
            continue
        seen.add(pid)
        website = _clean(website, 300)
        out[category].append((confidence or 0, {
            "sourceId": _clean(pid, 80), "name": name, "latitude": lat, "longitude": lon,
            "address": _clean(", ".join(x for x in (street, city) if x), 200),
            "detail": detail_for(basic, tax),
            "website": website if website and re.match(r"^https?://", website, re.I) else None,
            "phone": _clean(phone, 40), "openingHours": None,
        }))
    return {c: [p for _, p in sorted(items, key=lambda item: -item[0])[:MAX_PER_CATEGORY]] for c, items in out.items()}


def latest_release() -> str:
    """Newest Overture release folder, e.g. '2026-10-21.0' (public bucket listing, no account)."""
    url = f"https://{BUCKET}.s3.amazonaws.com/?list-type=2&prefix=release/&delimiter=/"
    with urllib.request.urlopen(url, timeout=60) as response:
        releases = re.findall(r"<Prefix>release/([0-9]{4}-[0-9]{2}-[0-9]{2}\.[0-9]+)/</Prefix>", response.read().decode())
    if not releases:
        raise RuntimeError("No Overture releases found.")
    return sorted(releases)[-1]


def read_area(con, release: str, lat: float, lon: float):
    """Every place within the widest radius of the area centre (bounding box; the radius per category is applied after)."""
    dlat = max(RADIUS_KM.values()) / 111.0
    dlon = dlat / max(0.2, math.cos(math.radians(lat)))
    return con.execute(f"""
      select id, names.primary, basic_category, taxonomy.primary, confidence, addresses[1].freeform, addresses[1].locality,
             websites[1], phones[1], bbox.ymin, bbox.xmin, operating_status
      from read_parquet('s3://{BUCKET}/release/{release}/theme=places/type=place/*')
      where bbox.xmin between ? and ? and bbox.ymin between ? and ? and confidence >= ?
    """, [lon - dlon, lon + dlon, lat - dlat, lat + dlat, MIN_CONFIDENCE]).fetchall()


def secret(name: str) -> str:
    """An environment value as pasted into GitHub: surrounding spaces, line breaks and quote marks removed."""
    return os.environ.get(name, "").strip().strip('"').strip("'").strip()


def supabase(path: str, body: dict) -> object:
    url = secret("SUPABASE_URL").rstrip("/") + path
    key = secret("SUPABASE_SERVICE_ROLE_KEY")
    request = urllib.request.Request(url, data=json.dumps(body).encode(), method="POST",
                                     headers={"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"})
    with urllib.request.urlopen(request, timeout=120) as response:
        return json.loads(response.read().decode() or "null")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--dry-run", action="store_true", help="read Overture and print what would be stored; no database")
    parser.add_argument("--at", help="lat,lon to import (default: every upcoming trip area that needs it)")
    parser.add_argument("--max-areas", type=int, default=25)
    args = parser.parse_args()

    import duckdb  # installed by the workflow (pip install duckdb)
    con = duckdb.connect()
    con.execute("INSTALL httpfs; LOAD httpfs; SET s3_region='us-west-2';")
    release = latest_release()
    now = datetime.now(timezone.utc)

    if args.at:
        lat, lon = (float(x) for x in args.at.split(","))
        work = [{"area": area_key(lat, lon), "fetched": {}}]
    else:
        work = supabase("/rest/v1/rpc/place_areas_to_import", {}) or []
    print(f"Overture release {release}; {len(work)} trip area(s) known")

    done = stored = 0
    for item in work:
        due = [c for c in CATEGORIES if needs_refresh((item.get("fetched") or {}).get(c), now)]
        if not due:
            continue
        if done >= args.max_areas:
            print("Area limit reached; the rest run tomorrow.")
            break
        lat, lon = (float(x) for x in item["area"].split(","))
        started = time.time()
        shaped = shape_places(read_area(con, release, lat, lon), lat, lon)
        done += 1
        for category in due:
            places = shaped[category]
            if args.dry_run:
                print(f"  {item['area']} {category}: {len(places)} e.g. " + " | ".join(f"{p['name']} [{p['detail']}]" for p in places[:4]))
            else:
                count = supabase("/rest/v1/rpc/store_places", {"p_source": "overture", "p_area": item["area"], "p_category": category, "p_places": places})
                stored += int(count or 0)
        print(f"{item['area']}: {', '.join(due)} in {time.time() - started:.1f}s")
    print(f"Done: {done} area(s), {stored} place(s) stored.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
