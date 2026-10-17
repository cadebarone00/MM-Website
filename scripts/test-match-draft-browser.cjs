const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:390,height:844}});const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.clock.install({time:new Date('2027-04-20T18:00:00Z')});
  const base=process.env.APP_URL||'http://localhost:3001';
  await page.route(base+'/dev',route=>route.fulfill({contentType:'text/html',body:'<script>window.addEventListener("message",event=>{if(event.origin===location.origin&&event.data?.channel==="maroon-dev-simulator-v1"&&event.data.type==="ready")window.tripReady=true;});</script><iframe title="Test trip" src="/dev/tournament?simulator=1" style="width:100%;height:100vh;border:0"></iframe>'}));
  await page.goto(base+'/dev');await page.waitForFunction(()=>window.tripReady===true);
  const config={source:'maroon',state:{competition:'source',format:'source',playerCount:null,roundStatus:'scheduled',loading:'off',opponentCard:'match',dualDraftMomentum:true,matchDraftPreview:'Response'},navigation:{tab:'Home'}};
  const send=()=>page.evaluate(config=>document.querySelector('iframe').contentWindow.postMessage({channel:'maroon-dev-simulator-v1',type:'config',config},location.origin),config);await send();
  const frame=page.frameLocator('iframe');await frame.getByRole('region',{name:'Upcoming match draft',exact:true}).waitFor();assert.equal(await frame.getByRole('region',{name:'Upcoming team draft',exact:true}).count(),0);
  await frame.getByRole('button',{name:'Match Room',exact:true}).click();const dialog=frame.getByRole('dialog',{name:'Match Draft',exact:true});await dialog.waitFor();
  const round=dialog.getByRole('combobox',{name:'Match draft round'});
  await dialog.getByRole('button',{name:'Start Response draft',exact:true}).click();
  await dialog.getByRole('button',{name:'Choose player',exact:true}).first().click();await dialog.getByRole('button',{name:/^Select .+ for Match/}).filter({visible:true}).first().click();
  await page.clock.fastForward(15000);assert.ok((await dialog.getByRole('timer').innerText()).includes('09:45'));
  await dialog.getByRole('button',{name:'Submit single',exact:true}).click();assert.equal(await dialog.getByRole('timer').innerText(),'10:00');
  await dialog.getByRole('button',{name:/^Select .+ for Match/}).filter({visible:true}).first().click();await dialog.getByRole('button',{name:'Submit single',exact:true}).click();
  assert.ok((await dialog.getByRole('status').first().innerText()).includes('puts forward - Match 2'));
  const singleNames=await dialog.locator('[data-filled=true] strong').allTextContents();assert.equal(singleNames.length,2);
  await round.selectOption('preview-Ranks-pairs');await dialog.getByRole('button',{name:'Start ranking window',exact:true}).click();
  const groupHeads=dialog.locator('[class*="matchGroup"]');
  await groupHeads.nth(0).getByRole('button',{name:'Choose player',exact:true}).first().click();
  await dialog.getByRole('button',{name:/^Select .+ for rank/}).filter({visible:true}).first().click();await dialog.getByRole('button',{name:/^Select .+ for rank/}).filter({visible:true}).first().click();
  await groupHeads.nth(1).getByRole('button',{name:'Choose player',exact:true}).first().click();await dialog.getByRole('button',{name:/^Select .+ for rank/}).filter({visible:true}).first().click();await dialog.getByRole('button',{name:/^Select .+ for rank/}).filter({visible:true}).first().click();
  const rankNames=await dialog.locator('[data-filled=true] strong').allTextContents();assert.equal(rankNames.length,4);
  await page.clock.fastForward(600000);await dialog.getByRole('status').filter({hasText:'Ranks locked'}).waitFor();assert.equal(await dialog.getByRole('timer').innerText(),'00:00');assert.equal(await dialog.getByRole('button',{name:/^Change /}).count(),0);assert.deepEqual(await dialog.locator('[data-filled=true] strong').allTextContents(),rankNames);
  await round.selectOption('preview-Response-pairs');await dialog.getByRole('button',{name:'Start Response draft',exact:true}).click();await dialog.getByRole('button',{name:'Choose player',exact:true}).first().click();
  const chosen=dialog.getByRole('button',{name:/^Select .+ for Match/}).filter({visible:true}).first();const chosenName=(await chosen.getAttribute('aria-label')).replace(/^Select /,'').replace(/ for Match.*/,'');await chosen.click();assert.ok(await dialog.getByRole('button',{name:'Submit pairing',exact:true}).isDisabled());
  await page.clock.fastForward(600000);await dialog.getByRole('status').filter({hasText:'1 timed-out group auto-filled'}).waitFor();assert.equal(await dialog.locator('[data-filled=true]').count(),2);assert.ok((await dialog.locator('[data-filled=true] strong').allTextContents()).includes(chosenName));assert.equal(await dialog.getByRole('timer').innerText(),'10:00');
  await page.clock.fastForward(3600000);await dialog.getByRole('status').filter({hasText:'All match groups locked'}).waitFor();const autoNames=await dialog.locator('[data-filled=true] strong').allTextContents();assert.equal(new Set(autoNames).size,autoNames.length);
  await round.selectOption('preview-Randomized');await dialog.getByRole('button',{name:'Randomize groups',exact:true}).click();assert.ok(await dialog.locator('[data-filled=true]').count()>0);
  await round.selectOption('preview-Ranks-pairs');assert.deepEqual(await dialog.locator('[data-filled=true] strong').allTextContents(),rankNames);await dialog.getByRole('status').filter({hasText:'Ranks locked'}).waitFor();
  await fs.mkdir('test-results/match-draft',{recursive:true});await page.screenshot({path:'test-results/match-draft/timed-ranks.png'});
  await dialog.getByRole('button',{name:'Close match draft room'}).click();config.state.viewAs='dev-jake';await send();await frame.getByRole('region',{name:'Upcoming match draft',exact:true}).getByRole('link',{name:'Edit'}).waitFor({state:'hidden'});await frame.getByRole('button',{name:'Match Room',exact:true}).click();assert.ok(await dialog.getByRole('button',{name:'Start Response draft',exact:true}).isDisabled());await dialog.getByRole('button',{name:'Close match draft room'}).click();
  for(const width of [320,390,768]){await page.setViewportSize({width,height:844});assert.equal(await page.locator('iframe').evaluate(el=>el.contentDocument.documentElement.scrollWidth>el.contentWindow.innerWidth),false);}
  await page.goto(pathToFileURL(path.resolve('docs/app-workflow.html')).href);await page.getByRole('region',{name:'Recent workflow changes'}).waitFor();await page.locator('#search').fill('Match Draft');assert.ok(await page.locator('details:not(.hidden)').count()>0);await page.locator('[data-open]').first().click();assert.deepEqual(errors,[]);
  console.log('Timed Response singles/pairs, fresh turn timers, partial-pair auto-fill, catch-up, ranked pairs and expiry locks, round isolation, member permissions and workflow UI passed.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1)});
