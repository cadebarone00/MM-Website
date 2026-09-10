import { mapGolfCourse, mapGolfSearch } from "./golfApiMapping";

async function request(path: string) {
  const key = process.env.GOLF_API_KEY?.trim();
  if (!key) throw new Error("Course search is not connected yet. Add a GolfAPI.io API key to the server settings.");
  let response: Response;
  try { response = await fetch(`https://golfapi.io/api/v2.3/${path}`, { headers: { Authorization: `Bearer ${key}` }, cache: "no-store", signal: AbortSignal.timeout(15000) }); }
  catch { throw new Error("The course provider could not be reached. Please try again."); }
  if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? "The course provider rejected the API key. Check the account settings." : response.status === 429 ? "Course search has reached its request limit. Try again later." : "The course provider could not complete this request.");
  try { return await response.json(); } catch { throw new Error("The course provider returned an unreadable response."); }
}
export async function searchGolfCourses(name: string, page: number) {
  return mapGolfSearch(await request(`courses?${new URLSearchParams({ name, page: String(page) })}`));
}
export async function fetchGolfCourse(id: string) {
  return mapGolfCourse(await request(`courses/${encodeURIComponent(id)}`), id, new Date().toISOString());
}
