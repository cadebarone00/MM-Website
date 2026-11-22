/**
 * Create a trip → Courses step (owner request 2026-11-21): a course picked from the drop-down is kept in the
 * questionnaire as round<N>Course (name, as before) + round<N>CourseRef / round<N>CoursePlace / round<N>CoursePar.
 * When the trip is created, the picks go into Trip Settings (pickedCourses) so the round's scorecard can load.
 */
export interface TripCoursePick { roundNumber: number; ref: string; name: string; place: string; par: number | null }

const REF = /^[A-Za-z0-9_.:-]{1,300}$/;

/** The rounds whose course was picked from the search (a handle and a name); typed-only names aren't picks. */
export function tripCoursePicks(draft: Record<string, unknown>, roundNumbers: number[]): TripCoursePick[] {
  const text = (key: string) => (typeof draft[key] === "string" ? (draft[key] as string).trim() : "");
  return roundNumbers.flatMap((roundNumber) => {
    const ref = text(`round${roundNumber}CourseRef`), name = text(`round${roundNumber}Course`);
    if (!REF.test(ref) || !name || name.length > 200) return [];
    const par = Number(text(`round${roundNumber}CoursePar`));
    return [{ roundNumber, ref, name, place: text(`round${roundNumber}CoursePlace`).slice(0, 200), par: Number.isInteger(par) && par >= 27 && par <= 90 ? par : null }];
  });
}

/** Trip Settings' pickedCourses for these picks. `slotKeys[i]` is round i + 1's slot (roundSlotKeys in tripRoundPars.ts). */
export function pickedCoursesForSlots(slotKeys: string[], picks: TripCoursePick[]): Record<string, { ref: string; name: string; place: string; par: number | null }> {
  const picked: Record<string, { ref: string; name: string; place: string; par: number | null }> = {};
  for (const pick of picks) {
    const key = slotKeys[pick.roundNumber - 1];
    if (key) picked[key] = { ref: pick.ref, name: pick.name, place: pick.place, par: pick.par };
  }
  return picked;
}
