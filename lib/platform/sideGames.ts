import type { HoleInput } from "./roundGames.ts";

/**
 * Play a round → side games (owner request 2026-11-22): greenies on every par 3, longest drive and closest to the pin on
 * the holes the host picked. The scorekeeper taps each hole's winner (the group decides). The winner collects the value
 * from each other player, so money adds up to zero. A greenie nobody won carries over: the next par 3's greenie is worth
 * its value for each par 3 it carried. Players are indexes in the playing order; holes are 0-based (setup holes 1-based).
 */
export interface SideGames {
  greenies?: { value: number };
  longestDrive?: { value: number; holes: number[] };
  closestPin?: { value: number; holes: number[] };
}

export interface SideMoney { total: number[]; byHole: (number | null)[][] }

/** Which side-game cards a hole shows on the scoring tab. */
export function sideGamesOn(side: SideGames | undefined, hole: number, par: number[]): ("greenie" | "longestDrive" | "closestPin")[] {
  if (!side) return [];
  return [
    ...(side.greenies && par[hole] === 3 ? ["greenie" as const] : []),
    ...(side.longestDrive?.holes.includes(hole + 1) ? ["longestDrive" as const] : []),
    ...(side.closestPin?.holes.includes(hole + 1) ? ["closestPin" as const] : []),
  ];
}

/** Each player's side-game money in total and per hole (null on holes with nothing won). Null with no side games. */
export function sideGameMoney(side: SideGames | undefined, players: number, par: number[], range: [number, number], inputs: HoleInput[]): SideMoney | null {
  if (!side || !(side.greenies || side.longestDrive || side.closestPin) || players < 2) return null;
  const total = new Array<number>(players).fill(0);
  const byHole = Array.from({ length: players }, () => new Array<number | null>(par.length).fill(null));
  const win = (winner: number, amount: number, hole: number) => {
    if (winner < 0 || winner >= players || amount <= 0) return;
    for (let p = 0; p < players; p++) {
      const change = p === winner ? amount * (players - 1) : -amount;
      total[p] += change;
      byHole[p][hole] = (byHole[p][hole] ?? 0) + change;
    }
  };
  let carried = 0;
  for (let h = range[0]; h < range[1]; h++) {
    const input = inputs[h] ?? {};
    if (side.greenies && par[h] === 3 && input.greenie !== undefined) {
      carried += 1;
      if (input.greenie !== null) { win(input.greenie, side.greenies.value * carried, h); carried = 0; }
    }
    if (side.longestDrive?.holes.includes(h + 1) && input.longestDrive !== undefined) win(input.longestDrive, side.longestDrive.value, h);
    if (side.closestPin?.holes.includes(h + 1) && input.closestPin !== undefined) win(input.closestPin, side.closestPin.value, h);
  }
  return { total, byHole };
}
