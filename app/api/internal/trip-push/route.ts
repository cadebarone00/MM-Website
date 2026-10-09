import { momentumHeadline, momentumSubheading, type MomentumCause } from '@/lib/platform/momentumCopy';
import { timingSafeEqual } from 'node:crypto';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import { sendWebPush } from '@/lib/platform/webPushTransport';
import type { TripPushSubscription } from '@/lib/platform/tripPush';
export const runtime='nodejs';
export const maxDuration=60;
interface Delivery extends TripPushSubscription {id:string;lease:string;subscriptionId:string;tripId:string;eventId:string;kind:'score'|'milestone';cause:MomentumCause|null;subjectName:string|null;resultLabel:string|null}
export async function GET(request:Request) {
 const expected=process.env.CRON_SECRET;const supplied=request.headers.get('authorization')??'';
 const actualBytes=Buffer.from(supplied),expectedBytes=Buffer.from('Bearer '+(expected??''));
 const valid=expected && actualBytes.length===expectedBytes.length && timingSafeEqual(actualBytes,expectedBytes);
 if(!valid) return Response.json({error:'Unauthorized'},{status:401});
 if(!process.env.WEB_PUSH_VAPID_PRIVATE_KEY || !process.env.NEXT_PUBLIC_WEB_PUSH_VAPID_KEY || !process.env.WEB_PUSH_VAPID_SUBJECT) return Response.json({error:'Push is not configured.'},{status:503});
 const db=createSupabaseServiceRoleClient();const {data,error}=await db.rpc('claim_trip_push',{p_limit:20});
 if(error) return Response.json({error:'Push queue unavailable.'},{status:503});
 let delivered=0,failed=0;
 // Bounded batches stay below the route lifetime even if providers time out.
 const items=(data??[]) as Delivery[];
 for(let i=0;i<items.length;i+=5) await Promise.all(items.slice(i,i+5).map(async item=>{
  try {
   // Recheck suppression/membership immediately before delivery, including a change after claim.
   const {data:sub,error:subError}=await db.from('trip_push_subscriptions').select('profile_id,scores,milestones').eq('id',item.subscriptionId).maybeSingle();
   const {data:member,error:memberError}=sub?await db.rpc('is_golf_trip_member',{p_trip:item.tripId,p_profile:sub.profile_id}):{data:false,error:null};
   const {data:event,error:eventError}=await db.from('trip_momentum_events').select('withdrawn_at,cause,subject_name,result_label').eq('id',item.eventId).maybeSingle();
   if(subError||memberError||eventError) throw new Error('Delivery authorization unavailable');
   if(!event || event.withdrawn_at || !sub || !member || !sub[item.kind==='score'?'scores':'milestones']) {
    const {error:skipError}=await db.from('trip_push_deliveries').update({delivered_at:new Date().toISOString()}).eq('id',item.id).eq('lease_token',item.lease);
    if(skipError) throw new Error('Could not suppress delivery');return;
   }
   // Approved big-play headline followed by its cause; recipients explicitly opt in to named alerts.
   const status=await sendWebPush(item,JSON.stringify({title:event.cause?momentumHeadline(event.cause as MomentumCause):'The Maroon',body:event.cause?momentumSubheading(event.cause as MomentumCause,event.subject_name??'A golfer',event.result_label??undefined):'New scores are in. Catch up with your round.',tag:item.eventId,url:'/golf-trips/'+item.tripId+'#momentum'}));
   if(status===404||status===410) {const {error:e}=await db.from('trip_push_subscriptions').delete().eq('id',item.subscriptionId);if(e) throw new Error('Could not remove expired subscription');return;}
   if(status<200||status>=300) throw new Error('Push provider refused delivery');
   const {error:e}=await db.from('trip_push_deliveries').update({delivered_at:new Date().toISOString()}).eq('id',item.id).eq('lease_token',item.lease);
   if(e) throw new Error('Could not acknowledge delivery');delivered++;
  }catch{failed++;} // Never log endpoints, auth secrets or provider response bodies.
 }));
 return Response.json({delivered,failed},{headers:{'Cache-Control':'no-store'}});
}
