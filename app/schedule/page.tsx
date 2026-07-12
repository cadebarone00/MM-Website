import { redirect } from "next/navigation";
import { nextTournament } from "@/lib/data";

export default function ScheduleIndex() {
  redirect(`/schedule/${nextTournament.slug}`);
}
