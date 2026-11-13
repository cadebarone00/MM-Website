import { redirect } from "next/navigation";

/** App → Schedule: retired, goes to Golf Trips (as on the website). */
export default function AppSchedule() {
  redirect("/golf-trips/");
}
