// Sample courses for the Studio. Same shape as ScoringCourse in lib/platform/personalRound.ts
// (ref, name, place, par, optional strokeIndex, tees), so Task 4 can seed a round without reshaping.
export type SampleTee = { name: string; rating: number | null; slope: number | null };
export type SampleCourse = { ref: string; name: string; place: string; par: number[]; strokeIndex?: (number | null)[]; tees: SampleTee[] };

export const STEVENS_PARK_PAR = [4, 4, 3, 5, 4, 4, 3, 5, 4, 4, 4, 3, 5, 4, 4, 3, 5, 4];
export const RATED_TEE: SampleTee = { name: "Blue", rating: 70.4, slope: 124 };
export const UNRATED_TEE: SampleTee = { name: "Blue", rating: null, slope: null };

// Par per hole and the tee numbers for the two extra courses are sample values, not official.
export const SAMPLE_COURSES: SampleCourse[] = [
  { ref: "sim:stevens-park", name: "Stevens Park Golf Course", place: "Dallas, TX", par: STEVENS_PARK_PAR, tees: [RATED_TEE] },
  {
    ref: "sim:tenison-glen", name: "Tenison Park (Glen) (sample)", place: "Dallas, TX",
    par: [4, 5, 3, 4, 4, 4, 3, 5, 4, 4, 4, 3, 5, 4, 4, 3, 4, 5],
    tees: [{ name: "White", rating: 69.8, slope: 118 }, { name: "Blue", rating: 71.9, slope: 124 }],
  },
  {
    ref: "sim:sample-muni", name: "Sample Municipal (no rating)", place: "Dallas, TX",
    par: [4, 4, 4, 3, 5, 4, 3, 4, 5, 4, 4, 3, 4, 5, 4, 3, 4, 5],
    tees: [{ name: "Blue", rating: null, slope: null }],
  },
];
