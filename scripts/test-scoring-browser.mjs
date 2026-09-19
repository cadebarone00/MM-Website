import {build} from 'esbuild';
import {chromium} from 'playwright';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
const dir=resolve('node_modules/.cache/scoring-browser');await mkdir(dir,{recursive:true});
const entry=`import React from 'react';import {createRoot} from 'react-dom/client';
import {ScoringPanel} from '@/components/portal/ScoringPanel';
import {HandicapHoleEntry} from '@/components/portal/handicap/HandicapHoleEntry';
import {RoundInProgressCard} from '@/components/portal/handicap/RoundInProgressCard';
const holes=Array.from({length:18},(_,i)=>({number:i+1,par:4,yards:400}));
const box={id:'test-box',format:'Singles',maroonPlayers:['cade-barone'],whitePlayers:['cam-latto']};
createRoot(document.getElementById('root')).render(location.pathname==='/card'?<RoundInProgressCard playerSlug="cade-barone"/>:location.pathname==='/personal'?<HandicapHoleEntry draftKey="test-personal" holeKey="test-personal:hole" teeSet={{id:'gold',name:'Gold',rating:72,slope:113,holes}} onBack={()=>{}} onSubmit={async(holes)=>{document.body.dataset.complete='true';document.body.dataset.holes=String(holes.length);return {ok:true}}}/>:<ScoringPanel playerSlug="cade-barone" playerFullName="Cade Barone" round={1} matchBox={box} nameBySlug={{'cam-latto':'Cam Latto'}}/>);`;
await build({stdin:{contents:entry,loader:'tsx',resolveDir:process.cwd()},bundle:true,outfile:resolve(dir,'app.js'),jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'link-stub',setup(b){b.onResolve({filter:/^next\/link$/},()=>({path:'link',namespace:'link-stub'}));b.onLoad({filter:/.*/,namespace:'link-stub'},()=>({contents:"import React from 'react';export default function Link({href,children,onNavigate,...p}){return React.createElement('a',{href,...p},children)}",loader:'js',resolveDir:process.cwd()}));}},{name:'realtime-stub',setup(b){b.onResolve({filter:/lib\/supabase\/client/},()=>({path:'stub',namespace:'test'}));b.onLoad({filter:/.*/,namespace:'test'},()=>({contents:'export function createSupabaseBrowserClient(){return {channel(){const c={on(){return c},subscribe(){return c}};return c},removeChannel(){}}}',loader:'js'}));}}]});
const css=await postcss([tailwind()]).process(await readFile('app/globals.css','utf8'),{from:resolve('app/globals.css')});await writeFile(resolve(dir,'global.css'),css.css);
const server=createServer(async(req,res)=>{const path=req.url.split('?')[0];if(['/app.js','/app.css','/global.css'].includes(path)){res.setHeader('Content-Type',path.endsWith('.js')?'text/javascript':'text/css');res.end(await readFile(resolve(dir,path.slice(1))));}else res.end('<html><head><link rel="stylesheet" href="/global.css"><link rel="stylesheet" href="/app.css"></head><body style="margin:0;padding:112px 16px 0;background:#f5efe2"><div id="root"></div><script src="/app.js"></script></body></html>');});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true});
try{
 const context=await browser.newContext({viewport:{width:390,height:844}});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const holes=Array.from({length:18},(_,i)=>({number:i+1,par:4,yards:400}));let submissions=[];let fail=false;const requests=[];
 await page.route('**/api/portal/scoring/state?*',r=>r.fulfill({json:{ok:true,matchBox:{id:'test-box',state:'Live',format:'Singles',maroonPlayers:['cade-barone'],whitePlayers:['cam-latto']},holes,scores:[],submittedPlayers:[],holeSubmissions:submissions}}));
 await page.route('**/api/portal/scoring/hole',async r=>{const body=r.request().postDataJSON();requests.push(body);if(fail)return r.fulfill({status:503,json:{ok:false}});submissions=[{...body,player:'cade-barone',submittedAt:new Date().toISOString()}];return r.fulfill({json:{ok:true,submissions}});});
 await page.goto(origin);await page.getByRole('button',{name:'Submit Score',exact:true}).waitFor();
 await page.getByRole('button',{name:'Submit Score',exact:true}).click();assert.match(await page.locator('[aria-live="polite"]').innerText(),/Not all information/);assert.equal(requests.length,0);
 await page.getByRole('button',{name:'Fairway hit',exact:true}).click();await page.getByRole('button',{name:'GIR hit',exact:true}).click();await page.getByRole('group',{name:'Your putts',exact:true}).getByRole('button',{name:'4+',exact:true}).click();
 await page.getByRole('group',{name:'Your score',exact:true}).getByRole('button',{name:'12',exact:true}).click();
 await page.reload();await page.getByRole('button',{name:'Submit Score',exact:true}).waitFor();assert.equal(await page.getByRole('group',{name:'Your score',exact:true}).getByRole('button',{name:'12',exact:true}).getAttribute('aria-pressed'),'true');
 fail=true;await page.getByRole('button',{name:'Submit Score',exact:true}).click();await page.getByText('Saved on this device.',{exact:false}).waitFor();const requestId=requests[0].requestId;
 await page.reload();await page.getByRole('button',{name:'Submit Score',exact:true}).waitFor();fail=false;await page.evaluate(()=>window.dispatchEvent(new Event('online')));
 await page.waitForFunction(()=>JSON.parse(localStorage.getItem('live-queue:cade-barone:test-box')).value.length===0);assert.equal(requests.at(-1).requestId,requestId);assert.equal(requests.at(-1).putts,4);assert.equal(requests.at(-1).ownScore,12);
 for(const [width,height] of [[390,844],[375,667]]){await page.setViewportSize({width,height});const button=await page.getByRole('button',{name:/Submitted|Submit Score/,exact:true}).boundingBox();assert.ok(button.y+button.height<=height,'Submit must fit on screen');}
 console.log('PASS: live validation, 4+ putts, score above double par, draft reload, reconnect retry with same request ID, mobile action visibility');
 await page.setViewportSize({width:390,height:844});
 await page.getByRole('button',{name:'Scorecard',exact:true}).click();
 await page.getByText('Latto',{exact:false}).waitFor();
 assert.equal(await page.getByText('Yardage',{exact:true}).count(),2,'my scorecard and the competitor scorecard both render');
 await page.getByRole('button',{name:'Back',exact:true}).click();
 await page.getByRole('button',{name:/Submitted|Submit Score/,exact:true}).waitFor();
 console.log('PASS: live scoring Scorecard shows the competitor in a second grid, under a button outside the header');
 await page.goto(origin+'/personal');await page.getByRole('button',{name:'Next Hole',exact:true}).waitFor();await page.getByRole('group',{name:'Hole 1 score',exact:true}).getByRole('button',{name:'9',exact:true}).click();await page.reload();await page.getByRole('group',{name:'Hole 1 score',exact:true}).waitFor();assert.equal(await page.getByRole('group',{name:'Hole 1 score',exact:true}).getByRole('button',{name:'9',exact:true}).getAttribute('aria-pressed'),'true');
 // A score alone (it always defaults to par) doesn't count as "entered" -- putts/GIR/fairway are still required, and the Scorecard (reachable any time) shows a dash for those cells until they are.
 await page.getByRole('button',{name:'Scorecard',exact:true}).click();
 assert.ok(await page.getByText('–',{exact:true}).count()>0,'holes 2-18 have no putts/GIR/fairway yet, so their cells show a dash');
 assert.equal(await page.getByText('—',{exact:true}).count(),5,'no hole is fully entered yet, so all five totals read as a dash');
 await page.getByRole('button',{name:'Finish all 18 holes to submit',exact:true}).waitFor();
 assert.equal(await page.getByRole('button',{name:'Finish all 18 holes to submit',exact:true}).isDisabled(),true);
 await page.getByRole('button',{name:'Edit hole 1',exact:true}).click();
 await page.getByRole('group',{name:'Hole 1 score',exact:true}).waitFor();
 await page.getByRole('button',{name:'Fairway hit',exact:true}).click();await page.getByRole('button',{name:'GIR hit',exact:true}).click();await page.getByRole('group',{name:'Your putts',exact:true}).getByRole('button',{name:'2',exact:true}).click();
 for(let h=1;h<18;h++){
   await page.getByRole('button',{name:'Next Hole',exact:true}).click();
   await page.getByRole('button',{name:'Fairway hit',exact:true}).click();await page.getByRole('button',{name:'GIR hit',exact:true}).click();await page.getByRole('group',{name:'Your putts',exact:true}).getByRole('button',{name:'2',exact:true}).click();
 }
 await page.getByRole('button',{name:'Review Round',exact:true}).click();
 await page.getByRole('button',{name:'Submit Round',exact:true}).waitFor();
 assert.equal(await page.getByText('–',{exact:true}).count(),0,'every hole is entered once all 18 have putts/GIR/fairway, so no dashes remain');
 // The totals box under the grid: hole 1 was a 9 and the other 17 holes are pars, 2 putts each, every fairway and green hit.
 for(const [text,count] of [['77',1],['+5',1],['36',1],['100%',2],['18/18',2]])assert.equal(await page.getByText(text,{exact:true}).count(),count,'totals box shows '+text);
 // Submit Round asks first: nothing is sent until Submit Scores, and Escape / Keep editing both back out.
 await page.getByRole('button',{name:'Submit Round',exact:true}).click();
 const dialog=page.getByRole('dialog');
 await dialog.getByRole('heading',{name:'Confirm',exact:true}).waitFor();
 await dialog.getByText('After you submit scores you will not be able to edit them.',{exact:true}).waitFor();
 assert.equal(await page.locator('body').getAttribute('data-complete'),null,'opening the confirmation submits nothing');
 await page.keyboard.press('Escape');
 await dialog.waitFor({state:'detached'});
 await page.getByRole('button',{name:'Submit Round',exact:true}).click();
 await dialog.getByRole('button',{name:'Keep editing',exact:true}).click();
 await dialog.waitFor({state:'detached'});
 assert.equal(await page.locator('body').getAttribute('data-complete'),null,'keep editing submits nothing');
 await page.getByRole('button',{name:'Submit Round',exact:true}).click();
 await page.getByRole('dialog').getByRole('button',{name:'Submit Scores',exact:true}).click();
 await page.waitForFunction(()=>document.body.dataset.complete==='true');
 assert.equal(await page.locator('body').getAttribute('data-holes'),'18');
 // The current hole is saved with the draft, so leaving and coming back lands on the same hole.
 await page.reload();await page.getByRole('group',{name:'Hole 18 score',exact:true}).waitFor();
 console.log('PASS: the hole you were on is remembered across a reload');
 // My Handicap's "Round in progress" box: seeded the way the wizard saves a started round.
 const setup={submissionId:'abc',course:{id:'c1',name:'Pebble Beach',city:'Pebble Beach',state:'CA',teeSets:[]},teeSet:{id:'t1',name:'Blue',rating:72.1,slope:131,holes:Array.from({length:18},(_,i)=>({number:i+1,par:4,yards:400}))},datePlayed:'2026-09-07',teeTime:''};
 await page.evaluate((setup)=>{localStorage.clear();const put=(k,v)=>localStorage.setItem(k,JSON.stringify({version:1,value:v}));put('handicap-wizard:cade-barone',{step:'holes',setup});put('handicap-holes:cade-barone:abc',{1:{score:'5'},2:{score:'6'}});put('handicap-holes:cade-barone:abc:hole',2);},setup);
 await page.goto(origin+'/card');
 const card=page.getByRole('region',{name:'Round in progress'});
 await card.waitFor();
 assert.equal(await card.getByLabel('To par').innerText(),'+3','holes 1-2 scored 5 and 6 on par 4s');
 const cardText=await card.innerText();
 for(const part of ['Pebble Beach','Blue','72.1/131','Sep 7, 2026'])assert.ok(cardText.includes(part),'box shows '+part);
 assert.equal(await card.getByRole('link').count(),0,'options stay hidden until the box is tapped');
 await card.getByRole('button',{name:/Pebble Beach/}).click();
 assert.equal(await card.getByRole('link',{name:'Continue playing'}).getAttribute('href'),'/portal/handicap/new');
 await card.getByRole('button',{name:'Delete round',exact:true}).click();
 await card.getByText('Delete this round?',{exact:false}).waitFor();
 await card.getByRole('button',{name:'Cancel',exact:true}).click();
 await card.getByRole('button',{name:'Delete round',exact:true}).waitFor();
 assert.notEqual(await page.evaluate(()=>localStorage.getItem('handicap-wizard:cade-barone')),null,'cancelling deletes nothing');
 await card.getByRole('button',{name:'Delete round',exact:true}).click();
 await card.getByRole('button',{name:'Delete',exact:true}).click();
 await card.waitFor({state:'detached'});
 assert.deepEqual(await page.evaluate(()=>Object.keys(localStorage)),[],'deleting clears the wizard state, hole draft and saved hole');
 assert.deepEqual(errors,[]);console.log('PASS: Round in progress box shows to-par/course/tee/rating, offers Continue or Delete (with confirm), and deleting clears everything');
 console.log('PASS: personal draft survives reload, Scorecard gates Submit until every hole has putts/GIR/fairway, tapping a hole number jumps back to it, then it submits all 18 holes');
}finally{await browser.close();await new Promise(r=>server.close(r));}
