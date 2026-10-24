// Real HTTP against the isolated stack/main. Synthetic fixture data only; no migrations.
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { localConfig, isolate, root } = require('./runtime.cjs');
const config = localConfig(); isolate(config);
const { createClient } = require('@supabase/supabase-js');
const admin = createClient(config.API_URL, config.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const anon = () => createClient(config.API_URL, config.ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const BASE = 'http://127.0.0.1:3997';
const identity = await fetch(BASE + '/__local_identity').then(r => r.json());
if (identity.environment !== 'maroon-auth-test' || identity.backend !== 'main') throw new Error('Wrong main runtime');
const results = [];
function check(name, ok) { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`); if (!ok) throw new Error(name); }
const password = `Local-phase2b-${randomUUID()}!`;
async function golfer(name) {
 const email = `phase2b-${name}-${randomUUID()}@auth-local.test`;
 const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
 if (created.error) throw new Error('Local fixture user creation failed');
 const id = created.data.user.id;
 const initialized = await admin.rpc('initialize_my_profile', { p_account: id });
 if (initialized.error) throw new Error('Local profile initialization failed');
 const profile = await admin.from('profiles').update({ display_name: `Phase2B ${name}`, username: `p2b_${name}_${Date.now()}` }).eq('id', id);
 if (profile.error) throw new Error('Local profile fixture failed');
 return { id, email };
}
const owner = await golfer('owner');
const member = await golfer('member');
const outsider = await golfer('outsider');
const today = new Date().toISOString().slice(0, 10);
const { golfTripPayloadFromBody } = await import('../../lib/platform/golfTripCreate.ts');
const parsed = golfTripPayloadFromBody({ requestId: randomUUID(), tripName: 'Main Phase 2B Trip', destination: 'Pinehurst, NC', startDate: today, endDate: today,
 playerCount:'4',yourName:'Phase2B Owner',yourEmail:owner.email,golfDays:'1',day1Date:today,day1Rounds:'1',round1Course:'Pinehurst No. 2',
 includesTournament:'no',knowsLodging:'no',knowsFlights:'no',knowsTransportation:'no' });
if (!parsed.ok) throw new Error('Fixture trip input invalid');
const created = await admin.rpc('create_golf_trip', { p_profile: owner.id, p_input: parsed.payload });
if (created.error) throw new Error('Local fixture trip creation failed');
const tripId = created.data.tripId;
const invite = randomUUID();
const invited = await admin.rpc('invite_golf_trip_member', { p_profile: owner.id, p_trip: tripId, p_input: {displayName:'Phase2B Member',email:null}, p_token:invite });
if (invited.error) throw new Error('Fixture invitation failed');
const accepted = await admin.rpc('accept_golf_trip_invitation', {p_profile:member.id,p_token:invite});
if (accepted.error) throw new Error('Fixture acceptance failed');
async function signIn(account) {
 const client = anon(); const reply = await client.auth.signInWithPassword({email:account.email,password});
 if (reply.error) throw new Error('Local sign-in failed');
 return reply.data.session;
}
const session = await signIn(member);
const other = await signIn(outsider);
const get = (path, token) => fetch(BASE+path,{headers:{Authorization:`Bearer ${token}`}});
check('main runtime identity verified', identity.supabase === config.API_URL);
check('real password sign-in', !!session.access_token);
const list = await get('/api/golf-trips',session.access_token); const listed=await list.json();
check('member lists saved trip', list.status===200 && listed.trips.some(t=>t.id===tripId));
const detail=await get('/api/golf-trips/'+tripId,session.access_token); const opened=await detail.json();
check('member opens detail from main',detail.status===200 && opened.trip.id===tripId && opened.viewer.role==='member');
check('detail omits private fields', !JSON.stringify(opened).includes('@') && !('created_by' in opened.trip));
check('outsider detail denied', (await get('/api/golf-trips/'+tripId,other.access_token)).status===404);
const otherList=await get('/api/golf-trips',other.access_token).then(r=>r.json());
check('account isolation', !otherList.trips.some(t=>t.id===tripId));
check('invalid token denied',(await get('/api/golf-trips','invalid')).status===401);
const noProfile = await admin.auth.admin.createUser({email:`phase2b-unfinished-${randomUUID()}@auth-local.test`,password,email_confirm:true});
if(noProfile.error)throw new Error('No-profile fixture failed');
const noProfileSession=await signIn({email:noProfile.data.user.email});
check('missing profile denied',(await get('/api/golf-trips',noProfileSession.access_token)).status===403);
const signout=await fetch(BASE+'/api/auth/signout',{method:'POST',headers:{Authorization:`Bearer ${session.access_token}`,'content-type':'application/json'},body:'{}'});
check('main sign-out success',signout.status===200);
check('old access token denied after revocation',(await get('/api/golf-trips',session.access_token)).status===401);
const refreshed=await anon().auth.refreshSession({refresh_token:session.refresh_token});
check('old refresh token denied',!!refreshed.error);
mkdirSync(root+'/out/phase2b',{recursive:true});
// Local synthetic credentials only, ignored artifact; never printed or shipped in the APK.
writeFileSync(root+'/out/phase2b/fixtures.json',JSON.stringify({password,owner,member,outsider,tripId}));
writeFileSync(root+'/out/phase2b/http-results.json',JSON.stringify({identity,results},null,2));
console.log('Real HTTP proof complete; tokens never persisted or logged.');
