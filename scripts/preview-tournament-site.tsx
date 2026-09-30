import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { texasCup, coastalOpen } from "../components/platform/tournament-site/fixtures.ts";
import { TournamentSite } from "../components/platform/tournament-site/pages.tsx";
import { ComingSoonSection, LockedSection, TournamentStatusBanner, TournamentTheme, TeamScoreSummary } from "../components/platform/tournament-site/components.tsx";
import { SITE_PAGES, type SiteLinks } from "../components/platform/tournament-site/types.ts";

const root = process.cwd();
const css = readFileSync(join(root, "components/platform/tournament-site/tournament-site.css"), "utf8");
const fixtures = { texas: texasCup, coastal: coastalOpen };
const views = Object.entries(fixtures).map(([key, data]) => {
  const links = Object.fromEntries(SITE_PAGES.map(page => [page, `#${key}-${page}`])) as SiteLinks;
  return SITE_PAGES.map(page => <div key={`${key}-${page}`} id={`${key}-${page}`} data-view hidden={key !== "texas" || page !== "home"}><TournamentSite data={data} page={page} links={links} id={`${key}-${page}-content`} /></div>);
});
const showcase = <div id="states" data-view hidden><TournamentTheme branding={coastalOpen.branding}><main className="ts-content"><h1>Component states</h1>{(["draft", "scheduled", "live", "final", "archived"] as const).map(status => <TournamentStatusBanner key={status} status={status} />)}<h2>Light team colors</h2><TeamScoreSummary teams={[{ id: "ivory", name: "Ivory Oaks", color: "#ffffff", points: 4 }, { id: "pine", name: "Pine Valley", color: "#225443", points: 3 }]} /><LockedSection title="Participant details" reason="Not available in this presentation preview." /><ComingSoonSection title="Tournament partners" /></main></TournamentTheme></div>;
const html = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Tournament Site Kit — Fictional Preview</title><style>body{margin:0} [data-view][hidden]{display:none!important}.demo-toolbar{padding:12px 20px;background:#17231e;color:white;font:13px/1.5 Arial,sans-serif;display:flex;gap:16px;align-items:center;flex-wrap:wrap}.demo-toolbar a{color:white;min-height:44px;display:inline-flex;align-items:center}.demo-toolbar select{font:inherit;min-height:44px;padding:5px}.demo-toolbar label{display:flex;align-items:center;gap:8px}'+css+'</style></head><body><aside class="demo-toolbar"><strong>FICTIONAL FIXTURES · LOCAL UI PREVIEW</strong><label>Event <select id="demo-event"><option value="texas">Texas Cup 2027</option><option value="coastal">Coastal Open 2028</option></select></label><a href="#states">Component states</a></aside>'+renderToStaticMarkup(<>{views}{showcase}</>)+'<script>function showView(){const id=location.hash.slice(1)||"texas-home";const views=[...document.querySelectorAll("[data-view]")];const target=views.find(view=>view.id===id)||views[0];views.forEach(view=>view.hidden=view!==target);if(target.id!=="states")document.getElementById("demo-event").value=target.id.split("-")[0];target.querySelector("main")?.focus({preventScroll:true});window.scrollTo(0,0)}window.addEventListener("hashchange",()=>{if(document.getElementById(location.hash.slice(1))?.hasAttribute("data-view"))showView()});document.getElementById("demo-event").addEventListener("change",e=>location.hash=e.target.value+"-home");showView();</script></body></html>';
mkdirSync(join(root, "out/tournament-site-preview"), { recursive: true });
writeFileSync(join(root, "out/tournament-site-preview/index.html"), html);
console.log("Created out/tournament-site-preview/index.html. Local fictional preview only; no application route or data writes.");
