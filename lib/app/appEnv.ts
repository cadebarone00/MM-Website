/**
 * The iPhone / Android app build (project_specs.md "The Maroon as a real iPhone app"). Both values are fixed when the
 * app is built (next.config.ts sets NEXT_PUBLIC_MAROON_APP; `npm run dev:app` points the API at this Mac's website
 * dev server). The website build never sets them.
 */
export const isAppBuild = process.env.NEXT_PUBLIC_MAROON_APP === "1";
/** The live server the app gets its data from. */
export const appApiBase = (process.env.NEXT_PUBLIC_MAROON_API_BASE || "https://themaroon.site").replace(/\/+$/, "");
