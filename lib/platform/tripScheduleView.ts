import { datePlus, type SetupBasis } from "./savedTripSetup";

/**
 * The trip's golf schedule as the setup editors show it (app Trip Settings, project_specs.md Golf Trips part 2g slice 2):
 * arrival / departure, the golf days and each round slot's key ("day-slot"), number, date, course and group tee times.
 * Worked out with exactly the same rules as the server's setupPlan (lib/platform/savedTripSetup.ts), so the round numbers
 * and courses an organizer sees are the ones that get saved.
 */
export type ScheduleSlot = { key: string; day: number; slot: number; number: number; date: string; course: string; picked: boolean; teeTimes: string[] };
export type ScheduleDay = { index: number; date: string; slots: ScheduleSlot[]; count: number };

const dayDifference = (from: string, to: string) => Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86400000);

export function tripSchedule(values: Record<string, unknown>, basis: SetupBasis) {
  const arrival = datePlus(basis.startDate, Number(values.arrivalShift ?? 0));
  const dayCount = Number(values.dayCount ?? dayDifference(basis.startDate, basis.endDate) + 1);
  const departure = datePlus(arrival, dayCount - 1);
  const golfOnArrival = values.golfOnArrival !== false, golfOnDeparture = values.golfOnDeparture !== false;
  const start = golfOnArrival ? 0 : 1;
  const golfDays = Math.max(0, dayCount - start - (golfOnDeparture ? 0 : 1));
  const counts = values.roundsPerDay as Record<string, number> | undefined;
  const picks = values.pickedCourses as Record<string, { name?: string }> | undefined;
  const names = values.slotCourseNames as Record<string, string> | undefined;
  const tees = values.teeTimes as Record<string, string[]> | undefined;
  let number = 0;
  const days: ScheduleDay[] = Array.from({ length: golfDays }, (_, day) => {
    const date = datePlus(arrival, day + start);
    const source = basis.rounds.filter((round) => round.playDate === date);
    const count = counts?.[day] ?? source.length;
    const slots = Array.from({ length: count }, (_, slot): ScheduleSlot => {
      const key = `${day}-${slot}`;
      const course = picks?.[key]?.name ?? names?.[key] ?? source[slot]?.courseName ?? "Course TBD";
      return { key, day, slot, number: ++number, date, course: course || "Course TBD", picked: !!picks?.[key], teeTimes: tees?.[key] ?? [] };
    });
    return { index: day, date, slots, count };
  });
  return { arrival, departure, dayCount, golfOnArrival, golfOnDeparture, days, slots: days.flatMap((d) => d.slots) };
}
