"""Tests for the pure parts of import_overture.py:  python -m unittest scripts/places/test_import_overture.py"""
import os
import sys
import unittest
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(__file__))
import import_overture as imp  # noqa: E402


class AreaKey(unittest.TestCase):
    def test_matches_the_app(self):
        # Same answers as lib/platform/placeAreas.test.ts.
        self.assertEqual(imp.area_key(33.4942, -111.9261), "33.50,-111.95")
        self.assertEqual(imp.area_key(33.5101, -111.9399), "33.50,-111.95")
        self.assertEqual(imp.area_key(-33.87, 151.21), "-33.85,151.20")
        self.assertEqual(imp.area_key(35.1954, -79.4695), "35.20,-79.45")


class Categories(unittest.TestCase):
    def test_mapping(self):
        self.assertEqual(imp.category_for("brewery", "brewery"), "bars")
        self.assertEqual(imp.category_for("coffee_shop", None), "coffee")
        self.assertEqual(imp.category_for("sports_or_recreation_venue", "driving_range_golf"), "golf")
        self.assertEqual(imp.category_for("golf_course", None), "golf")
        self.assertIsNone(imp.category_for("sports_or_fitness_instruction", "golf_instructor"), "lessons are not golf places")
        self.assertIsNone(imp.category_for("dental_clinic", "dentist"))
        self.assertIsNone(imp.category_for(None, None))


class Shape(unittest.TestCase):
    def row(self, pid, name, basic, conf=0.95, lat=33.5, lon=-111.95, status="open", website="https://x.example", tax=None):
        return (pid, name, basic, tax, conf, "1 Main St", "Scottsdale", website, "+1 480 555 0100", lat, lon, status)

    def test_filters_and_caps(self):
        rows = [
            self.row("a", "Goldwater Brewing", "brewery", tax="brewery"),
            self.row("b", "Closed Bar", "bar", status="permanently_closed"),
            self.row("c", "Unsure Cafe", "cafe", conf=0.5),
            self.row("d", "Far Coffee", "coffee_shop", lat=33.62),     # ~8.3 mi: outside coffee's 8 km
            self.row("e", "Far Course", "golf_course", lat=33.62),     # inside golf's 15 km
            self.row("a", "Duplicate", "brewery"),
            self.row("f", "Dentist", "dental_clinic"),
            self.row("g", "  ", "bar"),
            self.row("h", "Bad Link", "bar", website="javascript:alert(1)"),
        ]
        shaped = imp.shape_places(rows, 33.5, -111.95)
        self.assertEqual([p["name"] for p in shaped["bars"]], ["Goldwater Brewing", "Bad Link"])
        self.assertEqual(shaped["coffee"], [])
        self.assertEqual([p["name"] for p in shaped["golf"]], ["Far Course"])
        first = shaped["bars"][0]
        self.assertEqual(first, {"sourceId": "a", "name": "Goldwater Brewing", "latitude": 33.5, "longitude": -111.95,
                                 "address": "1 Main St, Scottsdale", "detail": "Brewery", "website": "https://x.example",
                                 "phone": "+1 480 555 0100", "openingHours": None})
        self.assertIsNone(shaped["bars"][1]["website"])

    def test_best_confidence_first_and_capped(self):
        rows = [self.row(f"r{i}", f"Spot {i}", "restaurant", conf=0.7 + i / 1000) for i in range(200)]
        food = imp.shape_places(rows, 33.5, -111.95)["food"]
        self.assertEqual(len(food), imp.MAX_PER_CATEGORY)
        self.assertEqual(food[0]["name"], "Spot 199")


class Refresh(unittest.TestCase):
    def test_refresh(self):
        now = datetime(2026, 11, 3, 12, tzinfo=timezone.utc)
        self.assertTrue(imp.needs_refresh(None, now))
        self.assertFalse(imp.needs_refresh("2026-10-20T12:00:00+00:00", now))
        self.assertTrue(imp.needs_refresh("2026-09-20T12:00:00Z", now))
        self.assertTrue(imp.needs_refresh("garbage", now))


if __name__ == "__main__":
    unittest.main()
