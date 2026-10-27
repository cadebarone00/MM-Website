// Verify the thin proxy preserves main's identity decision, using isolated test sessions only.
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
const require=createRequire(import.meta.url);
const {localConfig,isolate,root}=require('./runtime.cjs');const config=localConfig();isolate(config);
const {createClient}=require('@supabase/supabase-js');const {createServerClient}=require('@supabase/ssr');
const fixture=JSON.parse(readFileSync(root+'/out/phase2b/fixtures.json','utf8'));
const identity=await fetch('http://127.0.0.1:4100/__local_identity').then(response=>response.json());
if(identity.backend!=='main'||identity.environment!=='maroon-auth-test'||identity.supabase!==config.API_URL)throw new Error('Unverified local proxy identity');
const sessions=[];
async function login(account){
 const client=createClient(config.API_URL,config.ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
 const reply=await client.auth.signInWithPassword({email:account.email,password:fixture.password});
 if(reply.error)throw new Error('Isolated proxy test sign-in failed');
 sessions.push(reply.data.session);return reply.data.session;
}
const checks=[];
function check(name,ok){checks.push({name,ok});console.log(`${ok?'PASS':'FAIL'} ${name}`);if(!ok)throw new Error(name);}
try{
 const member=await login(fixture.member);const outsider=await login(fixture.outsider);
 const jar=new Map();
 const browser=createServerClient(config.API_URL,config.ANON_KEY,{cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})),setAll:entries=>entries.forEach(({name,value})=>jar.set(name,value))}});
 const established=await browser.auth.setSession(member);if(established.error)throw new Error('Isolated cookie fixture failed');
 const cookie=[...jar].map(([name,value])=>`${name}=${value}`).join('; ');
 const read=headers=>fetch('http://127.0.0.1:4100/api/golf-trips',{headers});
 check('proxy bearer alone retains valid identity',(await read({Authorization:'Bearer '+outsider.access_token})).status===200);
 check('proxy fresh cookie alone retains browser identity',(await read({Cookie:cookie})).status===200);
 check('proxy preserves rejection of conflicting cookie/bearer accounts',(await read({Cookie:cookie,Authorization:'Bearer '+outsider.access_token})).status===401);
 writeFileSync(root+'/out/phase2b/proxy-results.json',JSON.stringify({checks},null,2));
}finally{
 for(const session of sessions)await fetch('http://127.0.0.1:3997/api/auth/signout',{method:'POST',headers:{Authorization:'Bearer '+session.access_token,'content-type':'application/json'},body:'{}'});
}
