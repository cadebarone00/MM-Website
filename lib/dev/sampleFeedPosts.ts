/**
 * DEV ONLY: made-up Feed posts for the simulator's "Mock golf trip data", so the post design can be worked on.
 * A mix on purpose: text only, one photo, several photos, a long post, a photo with no words. Safe to import anywhere.
 */
export type SampleFeedPost = { id: number; author: string; when: string; text: string; photos: { url: string; name: string }[] };

export const SAMPLE_FEED_POSTS: SampleFeedPost[] = [
  { id: 9001, author: "Cam Latto", when: "12m ago", text: "Three birdies in a row on the back nine. Somebody check my bag for magnets 🧲", photos: [] },
  { id: 9002, author: "Drew Weisser", when: "1h ago", text: "View from the 7th tee. Not a bad office.", photos: [{ url: "/marketing/course-hero.jpg", name: "View from the 7th tee" }] },
  { id: 9003, author: "Jake Parker", when: "3h ago", text: "Team dinner is locked in for 7:30 at Mastro's. Jackets optional, appetites required.", photos: [] },
  { id: 9004, author: "Cade Barone", when: "Yesterday", text: "Champions wall is getting crowded. Who's next?", photos: [
    { url: "/champions/2024.jpg", name: "2024 champion" }, { url: "/champions/2025.jpg", name: "2025 champion" }, { url: "/champions/2026.jpg", name: "2026 champion" },
  ] },
  { id: 9005, author: "Mike Chen", when: "Yesterday", text: "", photos: [{ url: "/images/tourneys/course-hero.jpg", name: "Sunset on the range" }] },
  { id: 9006, author: "Kyle Schnabel", when: "2d ago", text: "Long one, sorry. Quick recap of round 1 for anyone who missed it: we started in the rain, Cam lost two balls on the first hole, Drew somehow chipped in from the cart path on 12, and the group behind us applauded when we finally finished. Best round of golf I've ever played badly. Can't wait for tomorrow.", photos: [] },
];
