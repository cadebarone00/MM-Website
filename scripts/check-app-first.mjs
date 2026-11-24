#!/usr/bin/env node
// App-first guard (docs/architecture/app-first.md, decided 2026-11-24). Runs on GitHub for every push.
//   FAIL  a new screen in the OLD Capacitor app (*.app.tsx). That app is frozen: bug fixes only, new screens go in mobile/.
//   WARN  a new website page outside the desktop-companion areas. It might be a player feature that belongs in mobile/.
// The lists of files that existed on 2026-11-24 live in scripts/app-first-baseline.json. Deleting a listed file is fine.
// Adding to the baseline needs the owner's OK. `node scripts/check-app-first.mjs --write-baseline` rewrites it.
import { readdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(import.meta.url), "..", "..");
const baselinePath = join(root, "scripts", "app-first-baseline.json");

/** Top-level app/ folders that are website (desktop companion) on purpose. New pages here are fine. */
const COMPANION = new Set([
  "admin", "portal", "dashboard", "dev", "dev-v1", "dev-website", "broadcast", "tap-in", "t", "watch", "watch-live",
  "website", "auth", "login", "signup", "forgot-password", "reset-password", "account", "contact", "sponsorship",
  "merchandise", "videos", "the-maroon", "schedule", "api",
]);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(relative(root, full).split(sep).join("/"));
  }
  return out;
}

const files = walk(join(root, "app"));
const oldAppScreens = files.filter((f) => f.endsWith(".app.tsx")).sort();
const websitePages = files.filter((f) => /\/page\.tsx$/.test(f)).sort();

if (process.argv.includes("--write-baseline")) {
  writeFileSync(baselinePath, JSON.stringify({ written: new Date().toISOString().slice(0, 10), oldAppScreens, websitePages }, null, 2) + "\n");
  console.log(`Baseline written: ${oldAppScreens.length} old-app screens, ${websitePages.length} website pages.`);
  process.exit(0);
}

const baseline = JSON.parse(readFileSync(baselinePath, "utf8"));
const knownApp = new Set(baseline.oldAppScreens);
const knownPages = new Set(baseline.websitePages);
const onGitHub = process.env.GITHUB_ACTIONS === "true";

const newAppScreens = oldAppScreens.filter((f) => !knownApp.has(f));
const newPlayerPages = websitePages.filter((f) => !knownPages.has(f) && !COMPANION.has(f.split("/")[1]));

for (const f of newPlayerPages) {
  const msg = `New website page outside the desktop-companion areas: ${f}. If players use it, it belongs in mobile/ (docs/architecture/app-first.md).`;
  console.log(onGitHub ? `::warning file=${f}::${msg}` : `WARN  ${msg}`);
}
for (const f of newAppScreens) {
  const msg = `New screen in the frozen Capacitor app: ${f}. Build new screens in mobile/ instead (docs/architecture/app-first.md).`;
  console.log(onGitHub ? `::error file=${f}::${msg}` : `FAIL  ${msg}`);
}

if (newAppScreens.length) process.exit(1);
console.log(`App-first check passed (${newPlayerPages.length} warning${newPlayerPages.length === 1 ? "" : "s"}).`);
