"use client";

import { MatchSimulator } from "@/components/portal/tiger/MatchSimulator";
import type { CareerCourseHole, CareerHoleRecord } from "@/lib/data/careerStats";

export function OddsModelLab({ records, courseHoles }: { records: CareerHoleRecord[]; courseHoles: CareerCourseHole[] }) {
  return <MatchSimulator records={records} courseHoles={courseHoles} />;
}
