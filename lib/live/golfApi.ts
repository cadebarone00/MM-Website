import { mapGolfCoreCourse, mapGolfCoreSearch } from "./golfCoreMapping";

async function request(path: string) {
  let response: Response;
  try { response = await fetch(`https://api.golfcore.org/v1/${path}`, { headers: { "User-Agent": "MaroonMasters/1.0 (+https://github.com/cadebarone00/MM-Website)", Accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(15000) }); }
  catch { throw new Error("The course provider could not be reached. Please try again."); }
  if (!response.ok) throw new Error(response.status === 429 ? "Course search is busy. Try again later." : "GolfCore could not complete this request.");
  try { return await response.json(); } catch { throw new Error("The course provider returned an unreadable response."); }
}
export async function searchGolfCourses(name: string, page: number) {
  return mapGolfCoreSearch(await request(`courses?${new URLSearchParams({ q: name, limit: "200", offset: String((page - 1) * 200) })}`));
}
export async function fetchGolfCourse(id: string) {
  return mapGolfCoreCourse(await request(`courses/${encodeURIComponent(id)}`), id, new Date().toISOString());
}
