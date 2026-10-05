"use client";

import { useEffect, useRef } from "react";
import { parseGpsCommand, SIMULATOR_CHANNEL, type SimulatorGpsState } from "@/lib/dev/simulator";
import type { GpsMode, PlayerFix } from "@/lib/platform/golfGps/types";

/**
 * DEV ONLY: links a GPS screen inside the /dev simulator's phone frame to the simulator's "GPS test" panel. Reports the
 * current mode and accuracy up to the panel, and carries out its commands (Real / Mock, step the mock player, reset).
 * Does nothing outside development or when the page isn't inside the simulator, so the real app has no GPS test controls.
 */
export function useSimulatorGps({ mode, setMode, fix, moveMock, resetMock }: {
  mode: GpsMode;
  setMode: (mode: GpsMode) => void;
  fix: PlayerFix | null;
  moveMock: (north: number, east: number) => void;
  resetMock: () => void;
}) {
  const inSimulator = process.env.NODE_ENV === "development" && typeof window !== "undefined" && window.parent !== window;
  const state: SimulatorGpsState = { mode, source: fix?.source ?? null, accuracyMeters: fix?.accuracy ?? null };
  const stateRef = useRef(state);
  const actions = useRef({ setMode, moveMock, resetMock });
  useEffect(() => { actions.current = { setMode, moveMock, resetMock }; }, [setMode, moveMock, resetMock]);

  const post = (value: SimulatorGpsState | null) => window.parent.postMessage({ channel: SIMULATOR_CHANNEL, type: "gps-state", state: value }, window.location.origin);

  // Report every change.
  const key = `${state.mode}|${state.source}|${state.accuracyMeters}`;
  useEffect(() => {
    stateRef.current = state;
    if (inSimulator) post(state);
    // `key` captures everything in `state`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inSimulator, key]);

  // Commands from the panel; also re-report whenever the simulator (re)sends its config, e.g. after the frame reloads.
  useEffect(() => {
    if (!inSimulator) return;
    function receive(event: MessageEvent) {
      if (event.origin !== window.location.origin || event.source !== window.parent || event.data?.channel !== SIMULATOR_CHANNEL) return;
      if (event.data.type === "config") { post(stateRef.current); return; }
      if (event.data.type !== "gps-command") return;
      const command = parseGpsCommand(event.data.command);
      if (!command) return;
      if ("mode" in command) actions.current.setMode(command.mode);
      else if ("reset" in command) actions.current.resetMock();
      else actions.current.moveMock(command.move.north, command.move.east);
    }
    window.addEventListener("message", receive);
    return () => { window.removeEventListener("message", receive); post(null); };
  }, [inSimulator]);
}
