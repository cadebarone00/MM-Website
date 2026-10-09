"use client";
import { useEffect, useState } from 'react';
import type { MomentumEvent } from '@/lib/platform/tripPush';
export interface TripAlertScope {tripId:string;profileId:string;isOrganizer?:boolean}
export function useTripMomentum(scope?:TripAlertScope) {
 const [state,setState]=useState<{key:string;events:MomentumEvent[];error:string;loading:boolean}>({key:'',events:[],error:'',loading:Boolean(scope)});
 const key=scope?scope.tripId+':'+scope.profileId:'';
 const tripId=scope?.tripId;
 useEffect(()=>{
  if(!key || !tripId) return;
  let stopped=false, pending=false;const controller=new AbortController();
  async function refresh(){
   if(pending || document.visibilityState==='hidden') return;pending=true;
   try{
    const res=await fetch('/api/golf-trips/'+tripId+'/momentum',{cache:'no-store',signal:controller.signal});
    const body=await res.json();if(!res.ok) { if(!stopped && (res.status===401||res.status===404)) setState({key,events:[],error:body.error,loading:false}); throw new Error(body.error??'Could not load momentum.'); }
    if(!stopped) setState({key,events:body.events,error:'',loading:false});
   }catch(e){if(!stopped) setState(s=>({key,events:s.key===key?s.events:[],loading:false,error:e instanceof Error?e.message:'Could not load momentum.'}));}
   finally{pending=false;}
  }
  void refresh();const timer=window.setInterval(()=>void refresh(),10000);
  const visible=()=>void refresh();document.addEventListener('visibilitychange',visible);window.addEventListener('online',visible);
  return()=>{stopped=true;controller.abort();window.clearInterval(timer);document.removeEventListener('visibilitychange',visible);window.removeEventListener('online',visible);};
 },[key,tripId]);
 return state.key===key?state:{key,events:[],error:'',loading:Boolean(scope)};
}
