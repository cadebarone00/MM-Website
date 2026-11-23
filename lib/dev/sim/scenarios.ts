import { PLAY_SCENARIOS } from "./scenarios/play";
import type { SimScenario } from "./types";

export const SCENARIOS: SimScenario[] = [...PLAY_SCENARIOS];

export const scenarioById = (id: string): SimScenario | undefined => SCENARIOS.find((s) => s.id === id);
