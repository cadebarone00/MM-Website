"use client";

import { useCallback, useEffect, useState } from "react";
import { offsetByYards } from "./distance";
import type { GpsMode, GpsStatus, LatLng, PlayerFix } from "./types";

/** How far one tap of a mock arrow moves the player. */
export const MOCK_STEP_YARDS = 10;

/**
 * The player's position for the GPS screen. "real" follows the device with navigator.geolocation.watchPosition();
 * if location is unsupported, denied or unavailable it falls back to "mock" (and `status` says why), so the screen
 * never breaks. "mock" starts at `mockStart` and moves only when moveMock / resetMock are called.
 */
export function usePlayerLocation(mockStart: LatLng, initialMode: GpsMode = "real") {
  const [mode, setModeState] = useState<GpsMode>(initialMode);
  const [status, setStatus] = useState<GpsStatus>(initialMode === "mock" ? "mock" : "locating");
  const [realFix, setRealFix] = useState<PlayerFix | null>(null);
  const [mockPoint, setMockPoint] = useState<LatLng>(mockStart);

  const setMode = useCallback((next: GpsMode) => {
    setModeState(next);
    setStatus(next === "mock" ? "mock" : "locating");
    if (next === "real") setRealFix(null);
  }, []);

  useEffect(() => {
    if (mode !== "real") return;
    // Real GPS can't run here: fall back to the mock player, keeping the reason for the banner.
    const fallBack = (reason: Exclude<GpsStatus, "mock" | "locating" | "tracking">) => { setModeState("mock"); setStatus(reason); };
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      const timer = window.setTimeout(() => fallBack("unsupported"));
      return () => window.clearTimeout(timer);
    }
    // `active` drops replies that land after we've left real mode; `hadFix` keeps a brief signal blip (common while
    // moving) from throwing away a working GPS: once we've had a fix, "unavailable" just keeps the last one.
    let active = true, hadFix = false;
    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        if (!active) return;
        hadFix = true;
        setRealFix({ lat: position.coords.latitude, lng: position.coords.longitude, accuracy: position.coords.accuracy, timestamp: position.timestamp, source: "real" });
        setStatus("tracking");
      },
      (error) => {
        if (!active) return;
        if (error.code === error.PERMISSION_DENIED) fallBack("denied");
        else if (error.code === error.POSITION_UNAVAILABLE && !hadFix) fallBack("unavailable");
        // TIMEOUT (or a blip after a fix): the watch keeps trying; "Finding you…" shows until the first fix.
      },
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 15000 },
    );
    return () => { active = false; navigator.geolocation.clearWatch(watchId); };
  }, [mode]);

  const moveMock = useCallback((north: number, east: number) => {
    setMockPoint((point) => offsetByYards(point, north * MOCK_STEP_YARDS, east * MOCK_STEP_YARDS));
  }, []);
  const resetMock = useCallback(() => setMockPoint(mockStart), [mockStart]);

  const fix: PlayerFix | null = mode === "mock"
    ? { ...mockPoint, accuracy: null, timestamp: 0, source: "mock" }
    : realFix;

  return { mode, setMode, status, fix, moveMock, resetMock };
}
