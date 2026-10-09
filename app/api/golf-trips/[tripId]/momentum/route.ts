import { momentumHeadline, momentumSubheading } from '@/lib/platform/momentumCopy';
import type { MomentumEvent } from '@/lib/platform/tripPush';
import { getGolfTrip } from '@/lib/platform/golfTripsServer';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';
export async function GET(_request: Request,{params}:{params:Promise<{tripId:string}>}) {
 const {tripId}=await params; const trip=await getGolfTrip(tripId);
 if(trip.status!=='ok') return Response.json({error:'Trip not found.'},{status:trip.status==='signed-out'?401:404});
 const {data,error}=await createSupabaseServiceRoleClient().from('trip_momentum_events')
  .select('id,kind,title,detail,round_number,created_at,cause,subject_name,result_label').eq('golf_trip_id',tripId).is('withdrawn_at',null).order('created_at',{ascending:false}).order('id',{ascending:false}).limit(50);
 if(error) return Response.json({error:'Momentum is unavailable. Try again shortly.'},{status:503});
 return Response.json({events:(data as MomentumEvent[]).map(e => e.cause ? { ...e, title: momentumHeadline(e.cause), detail: momentumSubheading(e.cause,e.subject_name ?? "A golfer",e.result_label ?? undefined) } : e)},{headers:{'Cache-Control':'private, no-store'}});
}
