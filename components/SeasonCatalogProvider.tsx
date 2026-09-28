"use client";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { sectionForPath, type WebsiteSection } from "@/lib/website/settings";
import { nextTournament, pastTournaments, latestCompleted, isPastLeaderboardSwitchover } from "@/lib/data";
import type { Tournament, UpcomingTournament } from "@/lib/data/types";
export type SeasonCatalogData = { section?: WebsiteSection; selectedYear?: number | null; nextTournament: UpcomingTournament; pastTournaments: Tournament[]; latestCompleted: Tournament; scheduled: boolean; leaderboardOpen: boolean };
const Context=createContext<SeasonCatalogData>({nextTournament,pastTournaments,latestCompleted,scheduled:false,leaderboardOpen:isPastLeaderboardSwitchover()});
export function SeasonCatalogProvider({ initial, children, section: fixedSection }: { initial: SeasonCatalogData; children: React.ReactNode; section?: WebsiteSection }) {
  const [data,setData]=useState(initial);
  const router=useRouter();
  const pathname=usePathname();
  const section=fixedSection ?? sectionForPath(pathname);
  const currentYear=useRef(initial.nextTournament.year);
  useEffect(()=>{
    let alive=true;
    const refresh=async()=>{try {const response=await fetch("/api/season-catalog?section="+section,{cache:"no-store"});if(!response.ok)return;const next:SeasonCatalogData=await response.json();if(alive){if(currentYear.current!==next.nextTournament.year){currentYear.current=next.nextTournament.year;router.refresh();}setData(next);}}catch{}};
    void refresh();
    const timer=setInterval(()=>{void refresh();},10000);
    return()=>{alive=false;clearInterval(timer);};
  },[router,section]);
  return <Context.Provider value={data}>{children}</Context.Provider>;
}
export function useSeasonCatalog(){
  const data=useContext(Context);
  const status=(now=new Date())=>{const start=Date.parse(data.nextTournament.liveAt),end=Date.parse(data.nextTournament.endDate+"T23:59:59");return now.getTime()<start||!Number.isFinite(start)?"upcoming":now.getTime()>end?"completed":"live";};
  return {...data,getNextTournamentStatus:status,isLiveNow:()=>status()==="live",isPastLeaderboardSwitchover:()=>data.leaderboardOpen};
}
