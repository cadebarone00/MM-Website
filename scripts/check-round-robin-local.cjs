// Isolated component integration: no hosted API or database is contacted.
require('tsx/cjs');
const fs = require('fs'), path = require('path'), { chromium } = require('playwright');
const root = process.cwd();
const mocks = {
  'next/link': 'export default function Link(p){return <a {...p}/>}',
  '@/components/dev/SimulatorBridge': 'export const useSimulator=()=>null;',
  '@/lib/dev/tripSetupStore': 'export const useDevSetup=()=>({});export const writeDevSetup=()=>{};',
  '@/lib/dev/justCreatedStore': 'export const readJustCreatedAll=()=>({});export const useJustCreatedVersion=()=>0;',
  './SavedTripSetupProvider': 'export const useSavedTripSetup=()=>window.fixture.saved;',
  '@/lib/dev/draftSim': 'export const draftSimFixture=()=>null;',
  '@/lib/dev/mockDraft': 'export const MOCK_DRAFT_PRESETS=[];export const MOCK_DRAFT_TRIP="mock";export const mockDraftTransport=()=>null;',
  './TripDraftRoom': 'export const TripDraftRoom=()=>null;',
  './TripMatchDraftRoom': 'export const TripMatchDraftRoom=()=>null;',
  '@/lib/platform/useTeamDraft': 'export const useTeamDraft=()=>({});',
};
(async () => {
  const result = await require('esbuild').build({
    stdin: { contents: 'import React from "react";import{createRoot}from"react-dom/client";import{TripDraftWidget}from"./components/platform/TripMomentum";const root=createRoot(document.getElementById("root"));window.render=()=>root.render(<TripDraftWidget {...window.fixture.props}/>);window.render();', resolveDir: root, loader: 'tsx' },
    bundle: true, write: false, outdir: 'local-check', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"development"' },
    plugins: [{ name: 'local-fixtures', setup(b) {
      b.onResolve({ filter: /.*/ }, a => {
        if (mocks[a.path]) return { path: a.path, namespace: 'mock' };
        const dir = a.importer && !mocks[a.importer] ? path.dirname(a.importer) : root;
        const req = a.path.startsWith('@/') ? path.join(root, a.path.slice(2)) : a.path.startsWith('.') ? path.resolve(dir, a.path) : a.path;
        return { path: require.resolve(req, { paths: [dir, root] }), namespace: 'source' };
      });
      b.onLoad({ filter: /.*/, namespace: 'mock' }, a => ({ contents: 'import React from "react";' + mocks[a.path], loader: 'jsx' }));
      b.onLoad({ filter: /.*/, namespace: 'source' }, a => ({ contents: fs.readFileSync(a.path, 'utf8'), loader: a.path.endsWith('.css') ? 'local-css' : a.path.endsWith('.tsx') ? 'tsx' : a.path.endsWith('.ts') ? 'ts' : a.path.endsWith('.json') ? 'json' : 'jsx' }));
    } }],
  });
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setContent('<body style="margin:0;padding:16px;background:#240001;color:#fbf8f1;--font-spectral:Georgia;--font-barlow:Arial;--lm-ink-fbf8f1:#fbf8f1;--lm-ink-dcc495:#dcc495;--lm-ink-ffffff:#fff"><style>' + result.outputFiles.find(f => f.path.endsWith('.css')).text + '</style><div id="root"></div>');
    await page.evaluate(() => {
      window.process = { env: { NODE_ENV: 'development' } };
      const players = ['Alex', 'Blair', 'Cam', 'Drew', 'Evan', 'Fran'].map((name, i) => ({ name, id: String(i) }));
      const format = { players: 6, format: 'Fourball', matchType: 'Match Play', pointsPerMatch: 1, nassau: false, scoring: 'Gross' };
      const types = { individual: null, team: 'Pairs' };
      const values = { localCompetitionType: types, submittedTeams: [[0, 1], [2, 3], [4, 5]], teamNames: ['Gold', 'Maroon', 'White'], compFormats: { '0-0': format }, allRoundsMatch: { method: 'Round Robin', date: '', time: '', draftType: null } };
      window.fixture = { props: { competitionTypes: types, players, rounds: [{ number: 1, date: '2027-04-20', course: 'Course TBD' }], scope: 'local-test', editHref: '/settings' }, saved: { tripId: 'local-test', values, readOnly: false, available: true, write: (field, value) => { window.fixture.saved.values = { ...window.fixture.saved.values, [field]: value }; window.lastWrite = field; window.render(); } } };
    });
    await page.addScriptTag({ content: result.outputFiles.find(f => f.path.endsWith('.js')).text });
    await page.getByRole('heading', { name: 'Team Draft', exact: true }).waitFor();
    await page.getByText('Teams complete', { exact: true }).waitFor();
    await page.getByRole('heading', { name: 'Match Selection', exact: true }).waitFor();
    if (await page.locator('select').count() !== 3) throw Error('Expected three pair-v-pair matches');
    await page.locator('select').first().selectOption('home');
    await page.waitForFunction(() => window.lastWrite === 'roundRobinResults');
    if (!(await page.getByRole('table').innerText()).includes('1.000')) throw Error('Standings did not update');
    await page.evaluate(() => { window.fixture.props.editHref = undefined; window.fixture.saved.readOnly = true; window.render(); });
    await page.waitForFunction(() => !document.querySelector('select'));
    if (!(await page.getByRole('table').innerText()).includes('1.000')) throw Error('Member lost saved result');
    await page.evaluate(() => { window.fixture.saved.values.submittedTeams = [[0, 1], [2, 3]]; window.render(); });
    await page.getByText('Complete team assignments first.', { exact: true }).waitFor();
    if (await page.getByRole('table').count()) throw Error('Incomplete teams produced a schedule');
    await page.evaluate(() => { window.fixture.saved.values.compFormats['0-0'] = { ...window.fixture.saved.values.compFormats['0-0'], format: 'Scramble', matchType: 'Stroke Play' }; window.render(); });
    await page.waitForFunction(() => ![...document.querySelectorAll('h2')].some(h => h.textContent === 'Match Selection'));
    await page.getByRole('heading', { name: 'Team Draft', exact: true }).waitFor();
    await page.evaluate(() => { window.fixture.props.competitionTypes = { individual: 'Match Play', team: null }; window.fixture.saved.values.localCompetitionType = window.fixture.props.competitionTypes; window.fixture.saved.values.compFormats['0-0'] = { ...window.fixture.saved.values.compFormats['0-0'], format: 'Singles', matchType: 'Match Play' }; window.render(); });
    await page.getByRole('table').waitFor();
    if (await page.getByRole('heading', { name: 'Team Draft', exact: true }).count()) throw Error('Individuals got Team Draft');
    if (await page.locator('select').count()) throw Error('Read-only individual got result controls');
    if ((await page.getByRole('table').innerText()).includes('1.000')) throw Error('Old team results leaked into individual standings');
    await page.evaluate(() => { window.fixture.saved.values.allRoundsMatch.method = null; window.fixture.props.competitionTypes = { individual: null, team: 'Pairs' }; window.fixture.saved.values.submittedTeams = [[0,1],[2,3],[4,5]]; window.fixture.props.playedThrough = 1; window.render(); });
    await page.getByText('Match selection complete', { exact: true }).waitFor();
    await page.evaluate(() => { window.fixture.props.rounds = []; window.fixture.props.competitionTypes = { individual: 'Match Play', team: null }; window.render(); });
    await page.getByText('Add match-play rounds to set up match selection.', { exact: true }).waitFor();
    await page.getByRole('heading', { name: 'Match Selection', exact: true }).waitFor();
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw Error('Mobile horizontal overflow');
    if (errors.length) throw Error(errors.join('\n'));
    console.log('Home competition and round-robin component integration passed. Fixtures only; no hosted writes.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
