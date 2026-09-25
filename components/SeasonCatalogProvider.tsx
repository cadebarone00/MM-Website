"use client";
import { createContext, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { nextTournament, pastTournaments, latestCompleted, isPastLeaderboardSwitchover } from "@/lib/data";
import type { Tournament, UpcomingTournament } from "@/lib/data/types";
export type SeasonCatalogData = { nextTournament: UpcomingTournament; pastTournaments: Tournament[]; latestCompleted: Tournament; scheduled: boolean; leaderboardOpen: boolean };
const Context=createContext<SeasonCatalogData>({nextTournament,pastTournaments,latestCompleted,scheduled:false,leaderboardOpen:isPastLeaderboardSwitchover()});
export function SeasonCatalogProvider({ initial, children }: { initial: SeasonCatalogData; children: React.ReactNode }) {
  const [data,setData]=useState(initial);
  const router=useRouter();
  useEffect(()=>{setData(initial);},[initial]);
  useEffect(()=>{
    let alive=true;
    const refresh=async()=>{try {const response=await fetch("/api/season-catalog",{cache:"no-store"});if(!response.ok)return;const next:SeasonCatalogData=await response.json();if(alive){setData(previous=>{if(previous.nextTournament.year!==next.nextTournament.year) router.refresh();return next;});}}catch{}};
    const timer=setInterval(()=>{void refresh();},60000);
    return()=>{alive=false;clearInterval(timer);};
  },[router]);
  return <Context.Provider value={data}>{children}</Context.Provider>;
}
export function useSeasonCatalog(){
  const data=useContext(Context);
  const status=(now=new Date())=>{const start=Date.parse(data.nextTournament.liveAt),end=Date.parse(data.nextTournament.endDate+"T23:59:59");return now.getTime()<start||!Number.isFinite(start)?"upcoming":now.getTime()>end?"completed":"live";};
  return {...data,getNextTournamentStatus:status,isLiveNow:()=>status()==="live",isPastLeaderboardSwitchover:()=>data.leaderboardOpen};
}
