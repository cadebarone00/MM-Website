# Marketing frontend boundary

Entry: `app/dev-website/page.tsx`. Preview: `http://localhost:3001/dev-website` with `npm run dev`. This route is development-only; the production entry and public homepage have not been switched.

Keep website presentation in this directory, CSS in local CSS Modules, and media in `public/marketing`. Imports within the website should be relative. Do not import from mobile/platform UI, legacy home components, Supabase, account hooks, season providers or scoring/rules modules. The entry may import this directory; the directory must not import application routes.

Run `node scripts/check-marketing-boundary.cjs` after changes. It checks static imports/re-exports, literal dynamic imports, local CSS imports and public media references. It is a source boundary guard, not a complete runtime/data-flow audit; inherited root infrastructure still exists.

The full-width photo and dark overlay composition adapts `components/home/VideoHero.tsx`; the local text wordmark follows `components/Wordmark.tsx`; maroon header/footer treatment follows `components/Header.tsx` and `components/Footer.tsx`; section rules follow `components/home/SectionHead.tsx`. Their import consumers were checked before reuse. These are presentation adaptations, not runtime imports or copies of their data/auth logic. Original files remain untouched.

Asset provenance: `public/marketing/course-hero.jpg` is a byte-for-byte presentation copy of the existing `public/images/tourneys/course-hero.jpg` (also used by the tournament-join UI). The copy keeps marketing independent of a legacy asset path; it does not establish publication rights. Confirm photographer/venue rights before public release. The original code-authored `fairway.svg` is retained as an unused design alternative. No video, player photos, sponsor marks or tournament records are copied.

See `docs/website-mobile-separation.md` for ownership, remaining inherited dependencies and the future extraction plan, and `docs/marketing-website-review.md` for unresolved release review.

Hero product asset: `public/marketing/v2-golf-trip-home.png` is a 2? capture of the existing V2 `/dev/tournament?simulator=1` Home screen using the `/dev` simulator?s Mock golf trip data and iPhone 16 preset (393?852). It is static presentation, with no app import or runtime bridge. Capture provenance and unresolved rights/claims review are recorded in `docs/marketing-website-review.md`. Hero wording is centralized in `heroCopy` in `WebsiteHero.tsx`.

Multi-device showcase: `WebsiteEcosystem.tsx` follows Features and uses scoped `WebsiteEcosystem.module.css`. It reuses the V2 screenshot; laptop and watch are HTML/CSS presentation concepts, not companion applications. Wording is centralized in `showcaseCopy`. No new image assets or dependencies.

Website merger phase 1: Sign In links to existing `/login/email`. Player Dashboard in the marketing footer opens `/dev-website?view=dashboard` in either website simulator group. `WebsitePlayerDashboard.tsx` uses only `playerDashboardFixture.ts` and scoped CSS; no real account, persistence or calculation is connected. Do not add preview data fallbacks to real account reads. Auth/data integration proposal: `docs/website-player-dashboard-integration.md`.

Phase 2: the development server entry injects `WebsiteAccountActions` from outside marketing after `loadWebsitePlayer()` validates the existing session. The boundary guard permits these two exact imports only at that server entry, plus presentation-only `next/link`. `WebsiteAccountDashboard` receives basic display name/username and a rendered account slot; it never imports auth, live queries or the fixture. `/dashboard` is a real guarded route. Mock design data remains isolated at `/dev-website?view=dashboard`. Current flow/review: `docs/website-player-portal-auth.md`.
