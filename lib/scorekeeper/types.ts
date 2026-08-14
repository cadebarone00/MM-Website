export interface HoleEntry {
  hole: number;
  par: number;
  yards: number;
  score: number;
  putts: number;
  fir: number | "X";
  gir: number;
}

export interface PlayerRounds {
  round: number;
  holes: HoleEntry[];
  partner: string | null;
  partnerHoles: HoleEntry[] | null;
}

export interface Pairing {
  row: number;
  round: number;
  session: string;
  format: string;
  maroonPlayers: string[];
  whitePlayers: string[];
}

export interface RoundState {
  round: number;
  started: boolean;
}

export type ScorekeeperResult<T> = { ok: true } & T | { ok: false; error: string };
