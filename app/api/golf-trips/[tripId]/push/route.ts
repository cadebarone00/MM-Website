import { getGolfTrip } from '@/lib/platform/golfTripsServer';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import { pushSubscriptionFrom } from '@/lib/platform/tripPush';
export async function GET(request:Request,{params}:{params:Promise<{tripId:string}>}) {
 const {tripId}=await params;const trip=await getGolfTrip(tripId);
 if(trip.status!=='ok') return Response.json({error:'Trip not found.'},{status:trip.status==='signed-out'?401:404});
 const endpoint=new URL(request.url).searchParams.get('endpoint');
 const db=createSupabaseServiceRoleClient();
 const {data,error}=await db.from('trip_push_subscriptions').select('scores,milestones').eq('profile_id',trip.viewer.profileId).eq('golf_trip_id',tripId).eq('endpoint',endpoint??'').maybeSingle();
 if(error) return Response.json({error:'Alerts are unavailable.'},{status:503});
 const configured=Boolean(process.env.NEXT_PUBLIC_WEB_PUSH_VAPID_KEY && process.env.WEB_PUSH_VAPID_PRIVATE_KEY && process.env.WEB_PUSH_VAPID_SUBJECT && process.env.CRON_SECRET);
 return Response.json({configured,publicKey:configured?process.env.NEXT_PUBLIC_WEB_PUSH_VAPID_KEY:null,preferences:data},{headers:{'Cache-Control':'private, no-store'}});
}
async function change(request:Request,tripId:string,remove:boolean) {
 if(request.headers.get('origin')!==new URL(request.url).origin) return Response.json({error:'Invalid origin.'},{status:403});
 const trip=await getGolfTrip(tripId);
 if(trip.status!=='ok') return Response.json({error:'Trip not found.'},{status:trip.status==='signed-out'?401:404});
 const raw=await request.text();if(raw.length>5000) return Response.json({error:'Invalid subscription.'},{status:400});
 let body;try{body=JSON.parse(raw);}catch{return Response.json({error:'Invalid subscription.'},{status:400});}
 if(!body || typeof body!=='object') return Response.json({error:'Invalid subscription.'},{status:400});
 const db=createSupabaseServiceRoleClient();
 if(remove) {
  if(typeof body.endpoint!=='string') return Response.json({error:'Invalid subscription.'},{status:400});
  const {error}=await db.from('trip_push_subscriptions').delete().eq('profile_id',trip.viewer.profileId).eq('golf_trip_id',tripId).eq('endpoint',body.endpoint);
  return Response.json(error?{error:'Could not turn alerts off.'}:{ok:true},{status:error?503:200});
 }
 if(!process.env.WEB_PUSH_VAPID_PRIVATE_KEY || !process.env.NEXT_PUBLIC_WEB_PUSH_VAPID_KEY || !process.env.WEB_PUSH_VAPID_SUBJECT || !process.env.CRON_SECRET) return Response.json({error:'Push alerts are not available yet.'},{status:503});
 const sub=pushSubscriptionFrom(body.subscription);
 if(!sub || typeof body.scores!=='boolean' || typeof body.milestones!=='boolean') return Response.json({error:'Invalid subscription.'},{status:400});
 const {data,error}=await db.rpc('save_trip_push',{p_profile:trip.viewer.profileId,p_trip:tripId,p_endpoint:sub.endpoint,p_key:sub.keys.p256dh,p_auth:sub.keys.auth,p_scores:body.scores,p_milestones:body.milestones});
 return Response.json(error||!data?{error:'Could not save alert preferences.'}:{ok:true},{status:error?503:!data?409:200});
}
export async function POST(request:Request,{params}:{params:Promise<{tripId:string}>}){return change(request,(await params).tripId,false);}
export async function DELETE(request:Request,{params}:{params:Promise<{tripId:string}>}){return change(request,(await params).tripId,true);}
