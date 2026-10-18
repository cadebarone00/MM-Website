"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { ArrowDown, ArrowUp, ChevronDown, ChevronUp, Search, X } from "lucide-react";
import { generateMatchDraft, matchDraftPlayerId, matchDraftSideSize, responseDraftTurn, type MatchDraftPlayer, type MatchDraftPlacement, type MatchDraftRound } from "@/lib/platform/matchDraft";
import { advanceResponseTimeouts, chooseResponsePlayer, clearRankSlot, draftMinutes, draftSessionLocked, responseStage, setRankSlot, startMatchDraftSession, submitResponseGroup, swapRankGroups, type MatchDraftSession } from "@/lib/platform/matchDraftSession";
import styles from "./TripDraftRoom.module.css";
export type { MatchDraftRound } from "@/lib/platform/matchDraft";
const clockNow = () => Math.floor(Date.now()/1000)*1000;
const subscribeClock = (update:()=>void) => {const timer=window.setInterval(update,250);return ()=>window.clearInterval(timer);};
const random = () => crypto.getRandomValues(new Uint32Array(1))[0]/4294967296;
type RankTarget = {match:number;team:"A"|"B";slot:number};

/** Timed, round-local grouping workspace; official scoring is unchanged. */
export function TripMatchDraftRoom({ rounds, players, initialRound, onClose, modal = false, canEdit = true, teamNames = ["Team A", "Team B"] }: {
 rounds:MatchDraftRound[];players:MatchDraftPlayer[];initialRound?:string;onClose:()=>void;modal?:boolean;canEdit?:boolean;teamNames?:string[];
}) {
 const dialog=useRef<HTMLDialogElement>(null);
 const [selected,setSelected]=useState(initialRound??rounds[0]?.key??"");
 const [expanded,setExpanded]=useState(false);
 const [tab,setTab]=useState<"all"|"A"|"B">("all");
 const [search,setSearch]=useState("");
 const [sessions,setSessions]=useState<Record<string,MatchDraftSession>>({});
 const [randomGroups,setRandomGroups]=useState<Record<string,MatchDraftPlacement[]>>({});
 const [target,setTarget]=useState<RankTarget|null>(null);
 const [message,setMessage]=useState("");
 const now=useSyncExternalStore(subscribeClock,clockNow,()=>null);
 const roster=useMemo(()=>players.filter((player,index)=>players.findIndex(other=>matchDraftPlayerId(player)===matchDraftPlayerId(other))===index),[players]);
 useEffect(()=>{if(!modal)return;const element=dialog.current;element?.showModal();return()=>element?.close();},[modal]);
 const timerInputs=useRef({rounds,roster});
 useEffect(()=>{timerInputs.current={rounds,roster};},[rounds,roster]);
 useEffect(()=>{
  const tick=()=>setSessions(current=>{
   const {rounds,roster}=timerInputs.current;
   const now=clockNow();
   let next=current;
   for(const round of rounds){const session=current[round.key];if(!session || round.type!=="Response" || session.deadline>now || session.blockedReason || !responseDraftTurn(round,session.placements))continue;
    const advanced=advanceResponseTimeouts(round,roster,session,now,random);
    if(advanced!==session){if(next===current)next={...current};next[round.key]=advanced;}
   }
   return next;
  });
  const timer=window.setInterval(tick,250);
  return ()=>window.clearInterval(timer);
 },[]);
 const round=rounds.find(item=>item.key===selected)??rounds[0];
 const session=round?sessions[round.key]:undefined;
 const timed=round?.type==="Ranks"||round?.type==="Response";
 const ranks=round?.type==="Ranks";
 const response=round?.type==="Response";
 const placements=session?.placements??(round?randomGroups[round.key]??[]:[]);
 const editable=canEdit&&!round?.locked;
 const active=!!(round&&session&&now!==null&&!draftSessionLocked(round,session,now));
 const turn=round&&response?responseDraftTurn(round,placements):null;
 const size=round?matchDraftSideSize(round):1;
 const complete=!!round&&placements.length===round.matches*size*2&&round.matches>0;
 const seconds=session&&now!==null?Math.max(0,Math.ceil((session.deadline-now)/1000)):null;
 const timerLabel=seconds===null?"Not started":Math.floor(seconds/60).toString().padStart(2,"0")+":"+(seconds%60).toString().padStart(2,"0");
 const label=(team:"A"|"B")=>teamNames[team==="A"?0:1]||"Team "+team;
 const visible=roster.filter(player=>!placements.some(p=>p.player===matchDraftPlayerId(player))&&!session?.pending.includes(matchDraftPlayerId(player))&&(tab==="all"||player.team===tab)&&player.name.toLowerCase().includes(search.toLowerCase()));
 const updateSession=(next:MatchDraftSession)=>{if(round)setSessions(current=>({...current,[round.key]:next}));};
 const openRank=(next:RankTarget)=>{if(!round||!session||!editable||!active)return;updateSession(clearRankSlot(round,session,next.match,next.team,next.slot,Date.now()));setTarget(next);setTab(next.team);setExpanded(true);setSearch("");};
 const start=()=>{if(!round||!editable||session)return;try{updateSession(startMatchDraftSession(round,roster,clockNow()));setMessage("");}catch(error){setMessage(error instanceof Error?error.message:"Could not start this draft.");}};
 const submit=()=>{if(!round||!session||!editable)return;try{const next=submitResponseGroup(round,roster,session,Date.now());updateSession(next);const nextTurn=responseDraftTurn(round,next.placements);if(nextTurn)setTab(nextTurn.team);setMessage("Group submitted.");}catch(error){setMessage(error instanceof Error?error.message:"Could not submit this group.");}};
 const status=!round?"Choose a round":round.locked?"Round started - Groups locked":!canEdit?"Organizer manages match selections":session?.blockedReason?session.blockedReason:ranks?(session?(active?"Set each team's numbered singles or pairings. Corresponding ranks face each other.":"Ranks locked - numbered groups are final."):"Both teams share one window to set their ranks and pairings."):response?(session?(complete?"All match groups locked":turn?label(turn.team)+(responseStage(turn.match,turn.team)==="opening"?" puts forward":" responds")+" - Match "+(turn.match+1):"All groups filled"):"Start the draft to put forward the first single or pairing."):"Shuffle each team into this round's match groups.";
 const content=<>
  <header className={styles.header}>
   <button type="button" className={styles.close} onClick={onClose} aria-label="Close match draft room"><X size={22}/></button>
   <div className={styles.titleBlock}><h1 id="match-draft-title">Match Draft</h1><p className={styles.when}>{round?.when||"Draft time not set"}</p></div>
   <span className={styles.count}>{roster.length}<small>PLAYERS</small></span>
  </header>
  <dl className={styles.draftTypes} aria-label="Match draft configuration"><div><dt>Draft Type</dt><dd>{round?.type||"Not selected"}</dd></div><div><dt>Format</dt><dd>{round?.format||"--"}{round?" - "+size+" v "+size:""}</dd></div></dl>
  {rounds.length?<label className={styles.matchRound}>Round<select aria-label="Match draft round" value={round?.key} onChange={event=>{setSelected(event.target.value);setMessage("");setTarget(null);setExpanded(false);setSearch("");}}>{rounds.map(item=><option key={item.key} value={item.key}>Round {item.number} - {item.course} - {item.format}</option>)}</select></label>:<p className={styles.message}>Choose Match Draft for a round in organizer Match Selection settings.</p>}
  {round&&<div className={styles.matchControls}>
   {timed&&<div className={styles.matchClock}><span>{ranks?"Time to set ranks":session&&turn?label(turn.team)+(responseStage(turn.match,turn.team)==="opening"?" puts forward":" responds"):"Turn timer"}</span><strong role="timer" aria-label={"Match draft time remaining: "+timerLabel}>{timerLabel}</strong></div>}
   <p role="status">{status}</p>
   {!session&&timed&&<p>{ranks?draftMinutes(round.rankMinutes)+" minutes to set ranks":draftMinutes(round.putForwardMinutes)+" minutes to put forward / "+draftMinutes(round.responseMinutes)+" minutes to respond"}</p>}
   <div className={styles.matchActions}>
    {timed&&!session&&<button type="button" className={styles.pick} disabled={!editable||!round.matches} onClick={start}>{ranks?"Start ranking window":"Start Response draft"}</button>}
    {response&&session&&turn&&!complete&&<><button type="button" className={styles.pick} disabled={!editable||!active} onClick={()=>{setTab(turn.team);setExpanded(true);}}>Choose player</button><button type="button" className={styles.pick} disabled={!editable||!active||session.pending.length!==size} onClick={submit}>{size===1?"Submit single":"Submit pairing"}</button></>}
    {ranks&&session&&<button type="button" className={styles.pick} disabled={!editable||!active} onClick={()=>{const team=tab==="B"?"B":"A";const empty=Array.from({length:round.matches*size},(_,i):RankTarget=>({match:Math.floor(i/size),slot:i%size,team})).find(t=>!placements.some(p=>p.match===t.match&&p.team===t.team&&p.slot===t.slot));if(empty)openRank(empty);}}>Set ranks / pairings</button>}
    {round.type==="Randomized"&&<button type="button" className={styles.pick} disabled={!editable||placements.length>0} onClick={()=>{try{setRandomGroups(current=>({...current,[round.key]:generateMatchDraft(round,roster,"Randomized",[],random)}));}catch(error){setMessage(error instanceof Error?error.message:"Could not build groups.");}}}>Randomize groups</button>}
    {round.type==="Randomized"&&placements.length>0&&<button type="button" className={styles.resetGroups} disabled={!editable} onClick={()=>setRandomGroups(current=>({...current,[round.key]:[]}))}>Reset round</button>}
   </div>
   {session?.autoFilledGroups? <p role="status">{session.autoFilledGroups} timed-out {session.autoFilledGroups===1?"group auto-filled":"groups auto-filled"}.</p>:null}
   {message&&<p role="status">{message}</p>}
  </div>}
  <div className={styles.board} aria-label="Match draft board">
   {(["A","B"] as const).map(team=><div key={team} className={styles.teamHead}><span>{team}</span><h2>{label(team)}</h2><small>{placements.filter(p=>p.team===team).length} / {(round?.matches??0)*size} selected</small></div>)}
   {round&&Array.from({length:round.matches},(_,match)=>(["A","B"] as const).map(team=><div key={team+match} className={styles.matchGroup}>
    <div className={styles.rankGroupHeading}><h3>{ranks?"Rank ":"Match "}{match+1}</h3>{ranks&&session&&<span className={styles.rankActions}><button type="button" className={styles.rankMove} aria-label={"Move "+label(team)+" rank "+(match+1)+" higher"} disabled={!editable||!active||match===0} onClick={()=>{updateSession(swapRankGroups(round,session,team,match,match-1,Date.now()));setTarget(null);}}><ArrowUp size={13}/></button><button type="button" className={styles.rankMove} aria-label={"Move "+label(team)+" rank "+(match+1)+" lower"} disabled={!editable||!active||match===round.matches-1} onClick={()=>{updateSession(swapRankGroups(round,session,team,match,match+1,Date.now()));setTarget(null);}}><ArrowDown size={13}/></button></span>}</div>
    {Array.from({length:size},(_,slot)=>{
     const pending=response&&turn?.match===match&&turn.team===team?session?.pending[slot]:undefined;
     const id=placements.find(p=>p.match===match&&p.team===team&&p.slot===slot)?.player??pending;
     const player=roster.find(p=>matchDraftPlayerId(p)===id);
     const canChoose=editable&&active&&(ranks||response&&turn?.match===match&&turn.team===team);
     return <div key={slot} className={styles.slot} data-filled={!!player} data-pending={!!pending} data-active={canChoose}>
      <span className={styles.number}>{slot+1}</span><div>{player?<><strong>{player.name}</strong><small>{pending?"Not submitted":player.handicap===undefined?label(team):"HCP "+player.handicap}</small>{canChoose&&<button type="button" className={styles.changePlayer} aria-label={"Change "+player.name+" in "+label(team)+" group "+(match+1)} onClick={()=>{if(ranks)openRank({match,team,slot});else if(session)updateSession({...session,pending:session.pending.filter(p=>p!==id)});}}>Change</button>}</>:canChoose?<button type="button" className={styles.openSlot} aria-label={"Choose "+label(team)+" player for "+(ranks?"rank ":"Match ")+(match+1)+", slot "+(slot+1)} onClick={()=>{if(ranks)openRank({match,team,slot});else{setTab(team);setExpanded(true);}}}>Choose player</button>:<span className={styles.empty}>Open spot</span>}</div>
     </div>;
    })}
   </div>))}
   {round&&!round.matches&&<p className={styles.message}>No match-play groups configured for this round.</p>}
  </div>
  <section className={styles.sheet} data-expanded={expanded} aria-label="Match draft players">
   <button type="button" className={styles.handle} aria-expanded={expanded} aria-controls="match-draft-player-panel" onClick={()=>setExpanded(value=>!value)}><span className={styles.grabber}/><span>Players<small>{visible.length} available</small></span>{expanded?<ChevronDown size={20}/>:<ChevronUp size={20}/>}</button>
   <div id="match-draft-player-panel" className={styles.panel} hidden={!expanded}>
    <div className={styles.tabs} role="group" aria-label="Match roster filter">{(["all","A","B"] as const).map(value=><button key={value} type="button" aria-pressed={tab===value} onClick={()=>setTab(value)}>{value==="all"?"All":label(value)}</button>)}</div>
    <label className={styles.search}><Search size={17}/><input aria-label="Search match draft players" placeholder="Search players" value={search} onChange={event=>setSearch(event.target.value)}/></label>
    {ranks&&target&&<p className={styles.rosterTarget}>{label(target.team)} - Rank {target.match+1} - Player {target.slot+1}</p>}
    <div className={styles.list}>{visible.map((player,index)=>{
     const eligible=editable&&active&&(ranks?target?.team===player.team:response&&turn?.team===player.team);
     return <div key={matchDraftPlayerId(player)} className={styles.player}><span className={styles.number}>{index+1}</span><strong>{player.name}<small className={styles.playerTeam}>{label(player.team)}</small></strong>{(ranks||response)&&<button type="button" className={styles.pick} disabled={!eligible} aria-label={"Select "+player.name+" for "+(ranks?"rank ":"Match ")+(ranks?(target?.match??0)+1:(turn?.match??0)+1)} onClick={()=>{
      if(!round||!session||!eligible)return;
      if(ranks&&target){const next=setRankSlot(round,roster,session,matchDraftPlayerId(player),target.match,target.team,target.slot,Date.now());updateSession(next);const empty=Array.from({length:size},(_,slot)=>({...target,slot})).find(t=>!next.placements.some(p=>p.match===t.match&&p.team===t.team&&p.slot===t.slot));setTarget(empty??null);if(!empty)setExpanded(false);}
      else updateSession(chooseResponsePlayer(round,roster,session,matchDraftPlayerId(player),Date.now()));
     }}>Select</button>}</div>;
    })}{!visible.length&&<p className={styles.message}>No available players match this selection.</p>}</div>
   </div>
  </section>
 </>;
 return modal?createPortal(<dialog ref={dialog} className={styles.room+" "+styles.matchRoom} aria-labelledby="match-draft-title" onCancel={onClose}>{content}</dialog>,document.body):<main className={styles.room+" "+styles.matchRoom} style={{display:"flex",flexDirection:"column"}} aria-label="Match Selection draft room">{content}</main>;
}
