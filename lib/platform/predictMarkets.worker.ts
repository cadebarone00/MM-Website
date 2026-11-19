/// <reference lib="webworker" />
import { runPredict } from "./predictRun";
import type { TripSetup } from "./predictBets";

// Background thread for Predict's odds: the 4,000 simulated trips run here, so the screen never freezes while they're worked out.
self.onmessage = (event: MessageEvent<{ id: number; setup: TripSetup }>) => {
  try {
    self.postMessage({ id: event.data.id, markets: runPredict(event.data.setup) });
  } catch (error) {
    self.postMessage({ id: event.data.id, error: error instanceof Error ? error.message : String(error) });
  }
};
