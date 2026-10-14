# The Maroon signature M

Approved artwork: Figma MPJDDApMHcbSSZPFe2mCuO, rounded intro vector 6:12; standalone vectors 12:7 and 12:12. Maroon #500F23. Preserve the small center loop and rounded right peak.

## Review locally

Copy the working project’s local environment file into `.env.local` in a new worktree (the root layout needs existing Supabase configuration). Never commit environment values. Run `npm ci`, `npm run dev`, then open http://localhost:3001/dev/brand. Click Replay entrance. Default drawing time is 1.2 seconds. Use the duration and stroke sliders to inspect the entry, center loop/crossing and exit. System reduced motion disables playback and displays the final mark. Changing duration or scrubbing stops playback. No sound is used.

The existing dev layout blocks this route in production. No simulator menu entry or startup wiring is added. The SVG assets are public static brand assets.

## Implementation

`MaroonMark` is a reusable SVG renderer accepting variant, color and progress. Five independent filled silhouette pieces are revealed by centerline masks, preventing later strokes from appearing prematurely at the center crossing. The loop has its own narrow 10-unit mask and 18% of the drawing interval, so its bottom is traced before the next upstroke. At completion the full outline replaces the pieces. All versions add a subtle 0.8-unit outline stroke with rounded joins; geometry and placement are preserved. IDs are unique per React instance. No animation library or video is needed.

Standalone SVGs have transparent backgrounds. Icon artwork is square with no baked-in corner masking. Before App Store integration, rasterize the icon at the required platform sizes. The phone-intro SVG preserves the approved screen artwork and centering; the studio scales it proportionally.

## Next integration

After motion approval, connect this renderer to the chosen native/web launch lifecycle. Define cold-launch versus resume behavior, readiness, timeout, route handoff and reduced-motion behavior before wiring. Do not make startup wait for a replay or activate an overlay on every navigation. Native launch screen and installed app icons are separate platform configuration work. No production assets have been replaced by this change.

## Scope review

This isolated brand studio adds no personal data, storage, accounts, permissions, UGC, vendors, payments, prizes, advertisements, subscriptions or audio. User supplied sketches and in-session approved artwork are the design source. Brand ownership/trademark clearance and distribution rights remain review_required before commercial release; visual approval is not legal clearance. No legal compliance certification or native-store approval is claimed. No compliance registry metadata was changed.
