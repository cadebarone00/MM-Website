import type { RibbonItem } from "./ribbon";

/**
 * DEV ONLY: sample Play page ribbon content, so the admin / poster / player screens can be tried on the local dev server
 * (and the iPhone simulator) before the content tables exist. Needs `DEV_RIBBON_SAMPLE=true` on a development server;
 * always off in a production build. Nothing here is saved anywhere; edits live in the page until a reload.
 */
export const isRibbonSampleEnabled = () => process.env.NODE_ENV === "development" && process.env.DEV_RIBBON_SAMPLE === "true";

/** Who's who in the sample. Admin ids are the two real admins' roles only, no account data. Posters are fictional. */
export const SAMPLE_ADMIN_ID = "sample-admin";
export const SAMPLE_POSTER_ID = "sample-poster-jordan";

export type ContentTeamMember = { profileId: string; name: string; username: string; status: "invited" | "active" | "removed"; invitedBy: string; invitedAt: string };

export function sampleContentTeam(now = new Date()): ContentTeamMember[] {
  return [
    { profileId: SAMPLE_POSTER_ID, name: "Jordan Reyes", username: "jreyes", status: "active", invitedBy: "Cam", invitedAt: daysFrom(now, -40) },
    { profileId: "sample-poster-taylor", name: "Taylor Brooks", username: "tbrooks", status: "invited", invitedBy: "Cade", invitedAt: daysFrom(now, -2) },
    { profileId: "sample-poster-sam", name: "Sam Ortiz", username: "sortiz", status: "removed", invitedBy: "Cam", invitedAt: daysFrom(now, -120) },
  ];
}

/** Dates are relative to today so Live / Scheduled always read correctly. */
export function sampleRibbonItems(now = new Date()): RibbonItem[] {
  const at = (days: number, hour = 9) => { const d = new Date(daysFrom(now, days)); d.setHours(hour, 0, 0, 0); return d.toISOString(); };
  return [
    { id: "s-explore-walk", kind: "post", format: "story", tab: "Explore", status: "published", publishAt: at(-3), createdBy: SAMPLE_ADMIN_ID, updatedAt: at(-3),
      title: "Dinah's Walk of Champions", summary: "Our favorite walk to the 18th green, and why every trip should end on one.",
      coverImage: "/teams/maroon/collage/05-walk-thumbsup.jpg",
      blocks: [{ type: "text", text: "The walk from the 18th green past the champions' plaques is the best few minutes of any trip. Take the photo. Everyone does." }, { type: "photo", src: "/teams/maroon/collage/06-walk-walking.jpg" }] },
    { id: "s-courses-dye", kind: "post", format: "story", tab: "Courses", status: "published", publishAt: at(-1), createdBy: SAMPLE_POSTER_ID, updatedAt: at(-2),
      title: "Course of the week: Pete Dye Challenge", summary: "Island greens, railroad ties and the hardest finish at Mission Hills.",
      coverImage: "/schedule/mission-hills.webp",
      blocks: [{ type: "text", text: "Play the par 5s for position, not distance. The 17th green is smaller than it looks from the tee." }, { type: "link", label: "Course website", url: "https://www.missionhills.com" }] },
    { id: "s-teaching-gate", kind: "post", format: "quick", tab: "Teaching", status: "published", publishAt: at(3), createdBy: SAMPLE_ADMIN_ID, updatedAt: at(-1),
      title: "Gate drill: two tees, one ball width apart. Ten in a row before you leave the green.", summary: "",
      coverImage: "", coverVideo: "/videos/home-hero.mp4", blocks: [] },
    { id: "s-teaching-chip", kind: "post", format: "story", tab: "Teaching", status: "pending", publishAt: null, createdBy: SAMPLE_POSTER_ID, updatedAt: at(-1, 15),
      title: "Chipping: land it on the fringe", summary: "Pick a landing spot one pace onto the green and let it roll.",
      coverImage: "/teams/maroon/collage/02-swing-pose.jpg", blocks: [] },
    { id: "s-equipment-bag", kind: "post", format: "story", tab: "Equipment", status: "changes_requested", publishAt: null, createdBy: SAMPLE_POSTER_ID, updatedAt: at(-2, 11),
      reviewNote: "Love it. Can you use a brighter photo?",
      title: "What's in the bag this season", summary: "Fourteen clubs, one lucky ball marker, and a wedge on its third grip.",
      coverImage: "/teams/maroon/collage/07-medallion.jpg", blocks: [] },
    { id: "s-news-recap", kind: "post", format: "story", tab: "News", status: "published", publishAt: at(-6), createdBy: SAMPLE_POSTER_ID, updatedAt: at(-6),
      title: "2026 recap: Team Maroon at Mission Hills", summary: "Photos, the final standings and the moments everyone is still talking about.",
      coverImage: "/teams/maroon/collage/01-hero-team.jpg", blocks: [
        { type: "text", text: "Four rounds, two teams and one very long walk up 18. The 2026 Maroon Tournament at Mission Hills came down to the last match on the course." },
        { type: "text", text: "Team Maroon led by two points after the scramble, gave most of it back in Wolf, then closed it out in Sunday singles." },
        { type: "heading", text: "The putt" },
        { type: "text", text: "On the final green, with the cup on a back-right shelf, the last match needed a two-putt from forty feet. The first one stopped eighteen inches short. Nobody breathed until the second one dropped." },
        { type: "quote", text: "I didn't look at the hole once. I just picked a spot on the fringe and trusted it." },
        { type: "photo", src: "/teams/maroon/collage/03-pink-polos.jpg", caption: "Matching polos for round two, by team vote." },
        { type: "heading", text: "What's next" },
        { type: "text", text: "Dates and the venue for 2027 go up on the Tourneys tab soon. Start practicing your lag putting." },
        { type: "video", url: "/videos/home-hero.mp4", caption: "Highlights from the week." },
        { type: "link", label: "See the final standings", url: "/tournaments" },
      ] },
    { id: "s-news-coin", kind: "post", format: "quick", tab: "News", status: "published", publishAt: at(-2), createdBy: SAMPLE_ADMIN_ID, updatedAt: at(-2),
      title: "Closest to the pin on 16 takes home the coin this year. Bring your wedge game.", summary: "",
      coverImage: "/teams/maroon/collage/07-medallion.jpg", blocks: [] },
    { id: "s-trip-scottsdale", kind: "trip_plan", tab: "Explore", status: "pending", publishAt: null, createdBy: SAMPLE_POSTER_ID, updatedAt: at(0, 8),
      trip: { city: "Scottsdale", region: "Arizona", length: "3 nights · 4 rounds", players: 4, image: "/teams/maroon/collage/02-swing-pose.jpg",
        tiers: [{ id: "standard", label: "Standard", price: "$1,150", stay: "Rental house in Old Town",
          courses: ["TPC Scottsdale (Champions)", "Troon North (Monument)", "We-Ko-Pa (Saguaro)", "Grayhawk (Raptor)"],
          days: [{ day: "Thu", plan: "Arrive PHX · TPC Scottsdale (Champions)" }, { day: "Fri", plan: "Troon North (Monument) · scramble" }, { day: "Sat", plan: "We-Ko-Pa (Saguaro) · Wolf" }, { day: "Sun", plan: "Grayhawk (Raptor) · singles · fly home" }],
          includes: ["4 rounds with cart", "3 nights lodging (shared)", "Group games set up in the app"] }] } },
  ];
}

function daysFrom(now: Date, days: number) { const d = new Date(now); d.setDate(d.getDate() + days); return d.toISOString(); }
