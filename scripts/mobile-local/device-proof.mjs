import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const require=createRequire(import.meta.url);
const {localConfig,isolate,root}=require('./runtime.cjs');const config=localConfig();isolate(config);
const {_android}=require('playwright');const {createClient}=require('@supabase/supabase-js');
const seed=JSON.parse(readFileSync(root+'/out/phase2b/fixtures.json','utf8'));
const ADB='C:/Users/Owner/AppData/Local/Android/Sdk/platform-tools/adb.exe';const PKG='site.themaroon.app.poc';
const adb=(...args)=>execFileSync(ADB,args,{encoding:'utf8',timeout:30000,stdio:['ignore','pipe','pipe']}).trim();
const results={checks:[],pageErrors:0,source:'main:3997 via proxy:4100'};
const save=()=>writeFileSync(root+'/out/phase2b/device-results.json',JSON.stringify(results,null,2));
function check(name,ok){results.checks.push({name,ok});save();console.log(`${ok?'PASS':'FAIL'} ${name}`);if(!ok)throw new Error(name);}
mkdirSync(root+'/out/phase2b',{recursive:true});
let device;
async function connect(){
 const pid=adb('shell','pidof',PKG).split(' ')[0];
 const webview=await device.webView({socketName:`webview_devtools_remote_${pid}`},{timeout:30000});const page=await webview.page();
 page.on('pageerror',()=>{results.pageErrors++;save();});return page;
}
async function launch(){adb('shell','am','force-stop',PKG);adb('shell','am','start','-W','-n',PKG+'/.MainActivity');return connect();}
async function login(page,who){await page.getByRole('textbox',{name:'Email',exact:true}).fill(who.email);await page.locator('input[name=password]').fill(seed.password);await page.getByRole('button',{name:'Log in',exact:true}).click();await page.locator('#upcoming-trips').waitFor({timeout:60000});}
const navigate=(page,path)=>page.evaluate(path=>{history.pushState(null,'',path);dispatchEvent(new PopStateEvent('popstate'));},path);
try{
 [device]=await _android.devices();if(!device)throw new Error('No emulator');
 results.android=adb('shell','getprop','ro.build.version.release');results.api=adb('shell','getprop','ro.build.version.sdk');
 adb('shell','cmd','connectivity','airplane-mode','disable');
 adb('shell','svc','wifi','enable');adb('shell','svc','data','enable');
 let page=await launch();await page.waitForFunction(()=>!!window.__poc,null,{timeout:60000});
 await page.evaluate(()=>window.__poc.signOut(true));
 await login(page,seed.member);
 check('native sign-in and main trip list',await page.getByRole('link',{name:/Main Phase 2B Trip/}).isVisible());
 check('native secure session retained without localStorage copy',await page.evaluate(async()=>window.__poc.native&&(await window.__poc.storedKeys()).includes('maroon-session')&&!localStorage.getItem('maroon-session')));
 await page.getByRole('link',{name:/Main Phase 2B Trip/}).click();await page.locator('[data-main-trip]').waitFor({timeout:60000});
 check('member opens main-backed read-only trip', (await page.locator('[data-main-trip]').innerText()).includes('Your role: member'));
 check('no Realtime render exception',results.pageErrors===0);
 await page.screenshot({path:root+'/out/phase2b/member-trip.png'});
 page=await launch();await page.waitForFunction(()=>document.documentElement.dataset.screenReady==='/api/golf-trips',null,{timeout:60000});
 check('session restored after process death',await page.getByRole('link',{name:/Main Phase 2B Trip/}).isVisible());
 const old=await page.evaluate(async()=>{const s=(await window.__poc.supabase.auth.getSession()).data.session;return {access:s.access_token,refresh:s.refresh_token};});
 await page.evaluate(()=>window.__poc.signOut());
 await page.getByRole('button',{name:'Log in',exact:true}).waitFor({timeout:30000});
 check('sign-out clears session and trip copies',await page.evaluate(async()=>{const keys=await window.__poc.storedKeys();return !keys.includes('maroon-session')&&!keys.some(k=>k.startsWith('maroon-trip:')||k.includes('/screens/trip'));}));
 check('native sign-out revokes old access token',(await fetch('http://127.0.0.1:3997/api/golf-trips',{headers:{Authorization:'Bearer '+old.access}})).status===401);
 const revoked=await createClient(config.API_URL,config.ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}}).auth.refreshSession({refresh_token:old.refresh});
 check('native sign-out revokes old refresh token',!!revoked.error);
 await login(page,seed.outsider);
 check('outsider list has no member trip',!(await page.locator('body').innerText()).includes('Main Phase 2B Trip'));
 await navigate(page,'/golf-trips/'+seed.tripId);await page.getByRole('alert').waitFor({timeout:30000});
 check('outsider direct trip navigation is denied',(await page.getByRole('alert').innerText())==='Not found.');
 // Change account without changing URL: the account-keyed screen must remount.
 const switched=await page.evaluate(async({email,password})=>!(await window.__poc.supabase.auth.signInWithPassword({email,password})).error,{email:seed.member.email,password:seed.password});
 check('account switch sign-in',switched);await page.locator('[data-main-trip]').waitFor({timeout:30000});
 check('account switch remounts authorized member trip',(await page.locator('[data-main-trip]').innerText()).includes('Your role: member'));
 await page.evaluate(async({email,password})=>{await window.__poc.supabase.auth.signInWithPassword({email,password});},{email:seed.outsider.email,password:seed.password});
 await page.getByRole('alert').waitFor({timeout:30000});
 check('switch back discards previous member trip',!(await page.locator('[data-main-trip]').count())&&(await page.getByRole('alert').innerText())==='Not found.');
 check('trip read flow has no WebSocket/page crash',results.pageErrors===0);
 await page.screenshot({path:root+'/out/phase2b/outsider-denied.png'});
 await page.evaluate(()=>window.__poc.signOut());
 // Exercise network transitions only after completing independent online assertions.
 await login(page,seed.member);
 adb('shell','cmd','connectivity','airplane-mode','enable');
 await navigate(page,'/golf-trips/'+seed.tripId);
 await page.getByRole('alert').waitFor({timeout:45000});
 check('offline trip read fails explicitly', (await page.getByRole('alert').innerText()).includes('offline'));
 adb('shell','cmd','connectivity','airplane-mode','disable');
 adb('shell','svc','wifi','enable');adb('shell','svc','data','enable');
 page=await launch();await page.locator('#upcoming-trips').waitFor({timeout:60000});
 check('network recovery cold launch restores current-account trip list',await page.getByRole('link',{name:/Main Phase 2B Trip/}).isVisible());
 await page.evaluate(()=>window.__poc.signOut());
}catch(error){results.failure=error.message.includes('Timeout')?'Timed out waiting for an asserted native flow':error.message;save();console.error(results.failure);process.exitCode=1;}
finally{try{adb('shell','cmd','connectivity','airplane-mode','disable');adb('shell','svc','wifi','enable');adb('shell','svc','data','enable');}catch{}if(device)await device.close();save();}
