const fs=require('fs'),http=require('http'),assert=require('node:assert/strict');
(async()=>{
await require('esbuild').build({entryPoints:['.tmp-scoring-review/entry.tsx'],outfile:'.tmp-scoring-review/bundle.js',bundle:true,platform:'browser',jsx:'automatic',define:{'process.env.NODE_ENV':'"development"'},logLevel:'silent'});
const css=(await require('postcss')([require('@tailwindcss/postcss')()]).process(fs.readFileSync('app/globals.css','utf8'),{from:'app/globals.css'})).css;
const server=http.createServer((req,res)=>{if(req.url==='/bundle.js'){res.setHeader('Content-Type','application/javascript');res.end(fs.readFileSync('.tmp-scoring-review/bundle.js'));}else if(req.url==='/style.css'){res.setHeader('Content-Type','text/css');res.end(css);}else{res.setHeader('Content-Type','text/html');res.end('<html><head><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>');}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await require('playwright').chromium.launch({headless:true});
try{
const page=await browser.newPage({viewport:{width:1200,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
let apiWrites=0;page.on('request',req=>{if(req.url().includes('/api/'))apiWrites++;});
await page.goto('http://127.0.0.1:'+server.address().port);
const m=page.frameLocator('iframe[title="maroon live scoring preview"]'),w=page.frameLocator('iframe[title="white live scoring preview"]');
await m.getByRole('group',{name:'Your score',exact:true}).waitFor();await w.getByRole('group',{name:'Your score',exact:true}).waitFor();
await m.getByRole('button',{name:'Next Hole',exact:true}).click();
assert.equal(await m.getByRole('button',{name:'Hole 1',exact:true}).getAttribute('title'),'empty');
await m.getByRole('button',{name:'Hole 1',exact:true}).click();await m.getByRole('button',{name:'Submit Score',exact:true}).click();await m.getByRole('alert').filter({hasText:'Not all information'}).waitFor();
async function stats(frame){await frame.getByRole('button',{name:'Fairway hit',exact:true}).click();await frame.getByRole('button',{name:'GIR hit',exact:true}).click();await frame.getByRole('group',{name:'Your putts',exact:true}).getByRole('button',{name:'2',exact:true}).click();}
async function score(frame,label,value){await frame.getByRole('group',{name:label,exact:true}).getByRole('button',{name:String(value),exact:true}).click();await page.waitForTimeout(250);}
await score(m,'Barone score',5);await stats(m);await m.getByRole('button',{name:'Submit Score',exact:true}).click();
await score(w,'Your score',5);await score(w,'Latto score',3);await stats(w);await w.getByRole('button',{name:'Submit Score',exact:true}).click();
await page.waitForTimeout(300);
for(const frame of [m,w])assert.equal(await frame.getByRole('button',{name:'Hole 1',exact:true}).getAttribute('title'),'disputed');
await page.getByText('Preview archive: 0 confirmed holes. Disputed holes are excluded.',{exact:true}).waitFor();
await w.getByRole('button',{name:'Hole 1',exact:true}).click();await score(w,'Latto score',4);await w.getByRole('button',{name:'Submit Score',exact:true}).click();
await page.getByText('Preview archive: 1 confirmed holes. Disputed holes are excluded.',{exact:true}).waitFor();
await m.getByRole('button',{name:'Hole 1',exact:true}).click();assert.equal(await m.getByRole('button',{name:'Submitted',exact:true}).isDisabled(),true);
await m.getByRole('group',{name:'Your putts',exact:true}).getByRole('button',{name:'1',exact:true}).click();assert.equal(await m.getByRole('button',{name:'Submit Score',exact:true}).isEnabled(),true);
await m.getByRole('button',{name:'Next Hole',exact:true}).click();await m.getByRole('button',{name:'Hole 1',exact:true}).click();assert.equal(await m.getByRole('button',{name:'Submit Score',exact:true}).isEnabled(),true);
await score(m,'Your score',6);await m.getByRole('button',{name:'Submit Score',exact:true}).click();await page.getByText('Preview archive: 0 confirmed holes. Disputed holes are excluded.',{exact:true}).waitFor();
await m.getByRole('button',{name:'Hole 1',exact:true}).click();await score(m,'Your score',4);await m.getByRole('button',{name:'Submit Score',exact:true}).click();await page.getByText('Preview archive: 1 confirmed holes. Disputed holes are excluded.',{exact:true}).waitFor();
await m.getByRole('button',{name:'Hole 4',exact:true}).click();await m.getByLabel('Fairway not applicable',{exact:true}).waitFor();assert.equal(await m.getByRole('button',{name:'Fairway hit',exact:true}).count(),0);
await m.getByRole('button',{name:'GIR hit',exact:true}).click();await m.getByRole('group',{name:'Your putts',exact:true}).getByRole('button',{name:'1',exact:true}).click();await m.getByRole('button',{name:'Submit Score',exact:true}).click();
await page.waitForTimeout(200);assert.equal(await m.getByRole('button',{name:'Hole 5',exact:true}).getAttribute('aria-pressed'),'true');
const desktop=await page.locator('iframe').evaluateAll(frames=>frames.map(f=>({x:f.getBoundingClientRect().x,y:f.getBoundingClientRect().y})));assert.ok(desktop[1].x>desktop[0].x);assert.equal(desktop[0].y,desktop[1].y);
await page.waitForTimeout(500);
for(const frame of [m,w]) { const geometry=await frame.getByRole('group',{name:'Your score',exact:true}).evaluate(el=>{const b=el.querySelector('[aria-pressed="true"]');return {scroll:el.scrollLeft, width:el.clientWidth, selected:b?.textContent, delta:b?b.getBoundingClientRect().left+b.offsetWidth/2-el.getBoundingClientRect().left-el.clientWidth/2:null};}); console.log(geometry); assert.ok(Math.abs(geometry.delta)<3); }
await page.screenshot({path:'.tmp-scoring-review/verified-desktop.png',fullPage:true});
await page.setViewportSize({width:390,height:844});const mobile=await page.locator('iframe').evaluateAll(frames=>frames.map(f=>({x:f.getBoundingClientRect().x,y:f.getBoundingClientRect().y})));assert.ok(mobile[1].y>mobile[0].y);assert.equal(mobile[0].x,mobile[1].x);
assert.equal(apiWrites,0);assert.deepEqual(errors,[]);console.log('Two-phone preview passed: validation, no-save navigation, mismatches, archive exclusion, correction, resubmission, par-3 N/A, desktop/mobile layout, and no live API calls.');
}finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});