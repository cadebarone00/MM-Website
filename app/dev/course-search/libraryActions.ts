"use server";

import { redirect } from "next/navigation";
import { getCourseLibrary } from "@/lib/platform/golfGps/repository/courseLibrary";

/**
 * DEV ONLY server actions for /dev/course-search: save an OpenGolf course into the Maroon course library, or refresh a
 * stored one from its sources. Run on the server (service-role key never reaches the browser); refuse outside
 * development. Each sends the page back to the same course with the outcome in the URL.
 */

const back = (form: FormData, extra: Record<string, string>) => {
  const params = new URLSearchParams();
  for (const key of ["q", "state", "id"]) {
    const value = form.get(key);
    if (typeof value === "string" && value) params.set(key, value);
  }
  for (const [key, value] of Object.entries(extra)) params.set(key, value);
  return `/dev/course-search?${params}`;
};
const reason = (error: unknown) => (error instanceof Error ? error.message : "Something went wrong.");

export async function saveToMaroon(form: FormData) {
  if (process.env.NODE_ENV !== "development") throw new Error("Dev only");
  const openGolfId = String(form.get("id") ?? "");
  let target: string;
  try {
    const result = await getCourseLibrary().getOrImportOpenGolfCourse(openGolfId);
    target = back(form, result ? { library: result.from === "import" ? "saved" : "already-saved" } : { libraryError: "OpenGolf has no course with that id." });
  } catch (error) {
    target = back(form, { libraryError: reason(error) });
  }
  redirect(target);
}

export async function refreshSources(form: FormData) {
  if (process.env.NODE_ENV !== "development") throw new Error("Dev only");
  const maroonId = String(form.get("maroonCourse") ?? "");
  let target: string;
  try {
    await getCourseLibrary().refreshCourse(maroonId);
    target = back(form, { library: "refreshed" });
  } catch (error) {
    target = back(form, { libraryError: `Refresh failed — the stored course was kept as it was. ${reason(error)}` });
  }
  redirect(target);
}
