"use client";

import { MatchSimulator } from "@/components/portal/tiger/MatchSimulator";
import type { CareerCourseHole, CareerHoleRecord, CareerTeamHoleRecord } from "@/lib/data/careerStats";

export function OddsModelLab({ records, teamRecords, courseHoles }: { records: CareerHoleRecord[]; teamRecords: CareerTeamHoleRecord[]; courseHoles: CareerCourseHole[] }) {
  return <MatchSimulator records={records} teamRecords={teamRecords} courseHoles={courseHoles} />;
}
