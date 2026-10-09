import { getGolfTrip } from '@/lib/platform/golfTripsServer';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';
export async function GET(_request:Request,{params}:{params:Promise<{tripId:string}>}){
 const {tripId}=await params;const trip=await getGolfTrip(tripId);if(trip.status!=='ok'||!trip.viewer.isOrganizer)return Response.json({error:'Trip not found.'},{status:404});
 const {data,error}=await createSupabaseServiceRoleClient().from('golf_trip_rounds').select('id,round_number,course_name,momentum_pars').eq('golf_trip_id',tripId).order('round_number');
 return Response.json(error?{error:'Round pars unavailable.'}:{rounds:data},{status:error?503:200,headers:{'Cache-Control':'private, no-store'}});
}
export async function POST(request:Request,{params}:{params:Promise<{tripId:string}>}){
 if(request.headers.get('origin')!==new URL(request.url).origin)return Response.json({error:'Invalid origin.'},{status:403});
 const {tripId}=await params;const trip=await getGolfTrip(tripId);if(trip.status!=='ok'||!trip.viewer.isOrganizer)return Response.json({error:'Trip not found.'},{status:404});
 const body=await request.json().catch(()=>null);
 if(!body || !Number.isInteger(body.round) || !Array.isArray(body.pars) || body.pars.length!==18 || body.pars.some((p:unknown)=>typeof p!=='number'||!Number.isInteger(p)||p<3||p>6))return Response.json({error:'Enter the actual par for all 18 holes.'},{status:400});
 const {data,error}=await createSupabaseServiceRoleClient().rpc('set_trip_momentum_pars',{p_profile:trip.viewer.profileId,p_trip:tripId,p_round:body.round,p_pars:body.pars});
 return Response.json(error||!data?{error:'Pars cannot change after scoring starts.'}:{ok:true},{status:error||!data?409:200});
}
