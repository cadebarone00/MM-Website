// Browser integration of the real editing components with an in-memory API.
// Does not connect to Supabase or change live website settings.
import { build } from "esbuild";
import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";

const output = resolve(".next/website-editor-check");
mkdirSync(output, { recursive: true });
await build({
  stdin: { contents: `import React from "react";
    import { createRoot } from "react-dom/client";
    import { WebsiteEditor } from "./components/portal/tiger/WebsiteEditor";
    import { WebsiteSettingsPanel } from "./components/portal/tiger/WebsiteSettingsPanel";
    import { emptyWebsiteSettings } from "./lib/website/settings";
    const settings = emptyWebsiteSettings();
    createRoot(document.getElementById("root")).render(location.pathname === "/settings-test"
      ? <WebsiteSettingsPanel initial={settings} available={true} />
      : <WebsiteEditor initial={settings} available={true} effectiveYears={Object.fromEntries(Object.keys(settings).map(key=>[key,2027]))} players={[{slug:"cam",name:"Cam"}]} />);`, resolveDir: process.cwd(), loader: "tsx" },
  bundle: true, outfile: resolve(output, "ui.js"), platform: "browser", jsx: "automatic",
  plugins: [{ name: "next-link-test-adapter", setup(builder) {
    builder.onResolve({ filter: /^next\/link$/ }, () => ({ path: "next-link", namespace: "test" }));
    builder.onLoad({ filter: /.*/, namespace: "test" }, () => ({ contents: 'import React from "react"; export default function Link(props){return React.createElement("a",props)}', resolveDir: process.cwd() }));
  } }],
});
const sections = ["home", "home_results", "home_schedule", "home_teams", "leaderboard", "teams", "schedule", "portal"];
const values = Object.fromEntries(sections.map(section => [section, null]));
let failSave = false;
const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  res.setHeader("Cache-Control", "no-store");
  if (url.pathname === "/api/portal/tiger/website-settings") {
    res.setHeader("Content-Type", "application/json");
    if (req.method === "POST") {
      let body = "";
      for await (const chunk of req) body += chunk;
      if (failSave) { res.statusCode = 500; res.end(JSON.stringify({ error: "Save rejected for browser test." })); return; }
      const data = JSON.parse(body);
      values[data.section] = data.year;
      res.end(JSON.stringify({ ok: true }));
    } else res.end(JSON.stringify({ available: true, settings: values }));
  } else if (url.pathname === "/api/season-catalog") {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ nextTournament: { year: values[url.searchParams.get("section")] ?? 2027 } }));
  } else if (url.pathname === "/ui.js") {
    res.setHeader("Content-Type", "text/javascript"); res.end(readFileSync(resolve(output, "ui.js")));
  } else if (["/editor-test", "/settings-test"].includes(url.pathname)) {
    res.setHeader("Content-Type", "text/html");
    res.end('<div id="root"></div><script src="/ui.js"></script>');
  } else {
    res.setHeader("Content-Type", "text/html");
    res.end('<main><div data-website-section="home_results">Select these results</div><div>Real site frame fixture</div></main>');
  }
});
await new Promise(done => server.listen(0, "127.0.0.1", done));
const base = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const editor = await context.newPage();
  const settings = await context.newPage();
  const errors = [];
  editor.on("pageerror", error => errors.push(error.message));
  settings.on("pageerror", error => errors.push(error.message));
  await editor.goto(base + "/editor-test");
  await settings.goto(base + "/settings-test");
  await editor.getByLabel("Home · tournament and hero", { exact: true }).selectOption("2028");
  await editor.getByRole("button", { name: "Save", exact: true }).click();
  await editor.getByRole("status").filter({ hasText: "Saved." }).waitFor();
  assert.equal(values.home, 2028);
  await settings.waitForFunction(() => document.querySelector("#website-year-home").value === "2028");
  // The reverse direction reads the same setting without remounting either interface.
  await settings.locator("#website-year-home").selectOption("2029");
  await settings.locator("#website-year-home").locator("..").getByRole("button", { name: "Save", exact: true }).click();
  await editor.waitForFunction(() => document.querySelector("#website-year-home").value === "2029");
  await editor.getByRole("button", { name: "Select on website", exact: true }).click();
  await editor.frameLocator('iframe[title="Live website editing view"]').getByText("Select these results").click();
  await editor.locator("#website-year-home_results").waitFor();
  await editor.locator("#website-year-home_results").selectOption("2026");
  await editor.getByRole("button", { name: "Save", exact: true }).click();
  await editor.getByRole("status").filter({ hasText: "Saved." }).waitFor();
  assert.equal(values.home, 2029);
  assert.equal(values.home_results, 2026);
  failSave = true;
  await editor.locator("#website-year-home_results").selectOption("2030");
  await editor.getByRole("button", { name: "Save", exact: true }).click();
  await editor.getByText("Save rejected for browser test.", { exact: true }).waitFor();
  assert.equal(values.home_results, 2026);
  assert.equal(await editor.locator("#website-year-home_results").inputValue(), "2030");
  failSave = false;
  await editor.locator("#website-year-home_results").selectOption("");
  await editor.getByRole("button", { name: "Save", exact: true }).click();
  await editor.getByRole("status").filter({ hasText: "Saved." }).waitFor();
  assert.equal(values.home_results, null);
  await editor.getByRole("button", { name: "Courses, formats and tee times", exact: true }).click();
  await editor.locator('iframe[title="Shared Tiger settings"]').waitFor();
  assert.match(await editor.locator('iframe[title="Shared Tiger settings"]').getAttribute("src"), /master-settings\/2027\/courses-format$/);
  await editor.getByRole("button", { name: "Done and refresh website" }).click();
  await editor.getByRole("button", { name: "Phone view" }).click();
  assert.match(await editor.locator('iframe[title="Live website editing view"]').getAttribute("class"), /390px/);
  assert.deepEqual(errors, []);
  // Required workflow presentation check: change panel, mapped navigation, search.
  const docs = await context.newPage();
  await docs.goto(pathToFileURL(resolve("docs/app-workflow.html")).href);
  assert.match(await docs.getByRole("region", { name: "Recent workflow changes" }).textContent(), /Tiger website editor/);
  await docs.locator("svg a").filter({ hasText: "Website editor" }).click();
  await docs.waitForFunction(() => [...document.querySelectorAll("details[open]")].some(item => item.textContent.includes("Website editing and shared settings")));
  await docs.locator("#search").fill("website_section_settings");
  assert.ok(await docs.locator("details:not(.hidden)").count() > 0);
  await docs.screenshot({ path: resolve(output, "workflow.png"), fullPage: false });
  console.log("PASS: two-way saves, independent sections, visual selection, failed-save recovery, Automatic reset, shared tee-time editor, phone view, and workflow navigation/search.");
} finally {
  await browser?.close();
  await new Promise(done => server.close(done));
}
