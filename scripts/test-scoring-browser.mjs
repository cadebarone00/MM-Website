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
const holes=Array.from({length:18},(_,i)=>({number:i+1,par:4,yards:400}));
const box={id:'test-box',format:'Singles',maroonPlayers:['cade-barone'],whitePlayers:['cam-latto']};
createRoot(document.getElementById('root')).render(location.pathname==='/personal'?<HandicapHoleEntry draftKey="test-personal" teeSet={{id:'gold',name:'Gold',rating:72,slope:113,holes}} onBack={()=>{}} onSubmit={async(holes)=>{document.body.dataset.complete='true';document.body.dataset.holes=String(holes.length);return {ok:true}}}/>:<ScoringPanel playerSlug="cade-barone" playerFullName="Cade Barone" round={1} matchBox={box} nameBySlug={{'cam-latto':'Cam Latto'}}/>);`;
await build({stdin:{contents:entry,loader:'tsx',resolveDir:process.cwd()},bundle:true,outfile:resolve(dir,'app.js'),jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'realtime-stub',setup(b){b.onResolve({filter:/lib\/supabase\/client/},()=>({path:'stub',namespace:'test'}));b.onLoad({filter:/.*/,namespace:'test'},()=>({contents:'export function createSupabaseBrowserClient(){return {channel(){const c={on(){return c},subscribe(){return c}};return c},removeChannel(){}}}',loader:'js'}));}}]});
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
 await page.getByRole('button',{name:'Round Recap',exact:true}).click();
 assert.match(await page.locator('body').innerText(),/Latto/i,'competitor row uses their real name');
 assert.match(await page.locator('body').innerText(),/Not entered yet/,'competitor has not submitted anything yet');
 await page.getByRole('button',{name:'Back',exact:true}).click();
 await page.getByRole('button',{name:/Submitted|Submit Score/,exact:true}).waitFor();
 console.log('PASS: live scoring Round Recap shows the competitor in a separate row');
 await page.goto(origin+'/personal');await page.getByRole('button',{name:'Next Hole',exact:true}).waitFor();await page.getByRole('group',{name:'Hole 1 score',exact:true}).getByRole('button',{name:'9',exact:true}).click();await page.reload();await page.getByRole('group',{name:'Hole 1 score',exact:true}).waitFor();assert.equal(await page.getByRole('group',{name:'Hole 1 score',exact:true}).getByRole('button',{name:'9',exact:true}).getAttribute('aria-pressed'),'true');
 // A score alone (it always defaults to par) doesn't count as "entered" -- putts/GIR/fairway are still required, and Round Recap (reachable any time) reflects that.
 await page.getByRole('button',{name:'Round Recap',exact:true}).click();
 assert.match(await page.locator('body').innerText(),/Not entered yet/,'hole 1 only has a score so far, not full stats');
 await page.getByRole('button',{name:'Finish all 18 holes to submit',exact:true}).waitFor();
 assert.equal(await page.getByRole('button',{name:'Finish all 18 holes to submit',exact:true}).isDisabled(),true);
 await page.getByRole('button',{name:'Back',exact:true}).click();
 await page.getByRole('group',{name:'Hole 1 score',exact:true}).waitFor();
 await page.getByRole('button',{name:'Fairway hit',exact:true}).click();await page.getByRole('button',{name:'GIR hit',exact:true}).click();await page.getByRole('group',{name:'Your putts',exact:true}).getByRole('button',{name:'2',exact:true}).click();
 for(let h=1;h<18;h++){
   await page.getByRole('button',{name:'Next Hole',exact:true}).click();
   await page.getByRole('button',{name:'Fairway hit',exact:true}).click();await page.getByRole('button',{name:'GIR hit',exact:true}).click();await page.getByRole('group',{name:'Your putts',exact:true}).getByRole('button',{name:'2',exact:true}).click();
 }
 await page.getByRole('button',{name:'Review Round',exact:true}).click();
 await page.getByRole('button',{name:'Submit Round',exact:true}).waitFor();
 assert.equal(await page.locator('body').innerText().then((t)=>t.includes('Not entered yet')),false,'every hole is entered once all 18 have putts/GIR/fairway');
 await page.getByRole('button',{name:'Submit Round',exact:true}).click();
 await page.waitForFunction(()=>document.body.dataset.complete==='true');
 assert.equal(await page.locator('body').getAttribute('data-holes'),'18');
 assert.deepEqual(errors,[]);console.log('PASS: personal draft survives reload, Round Recap gates Submit until every hole has putts/GIR/fairway, then submits all 18 holes');
}finally{await browser.close();await new Promise(r=>server.close(r));}
