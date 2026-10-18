"use client";
import {useEffect,useRef,useState} from "react";
import {ChevronDown,Trash2,X} from "lucide-react";
import {usePersistedState} from "@/lib/dev/justCreatedStore";
import {assignCaptain,captainTeam,handOffCaptain,playerRoleLabel,type CaptainContext,type CaptainPlayer,type TeamCaptains} from "@/lib/platform/teamCaptains";
import list from "./GolfTripMatch.module.css";
import settings from "./GolfTripSettingsPreview.module.css";
import styles from "./TripPlayerRoles.module.css";

type Viewer="organizer"|"captain-a"|"captain-b"|"player";
/** Development role workflow only; saved-trip membership authority is separate. */
export function TripPlayerRoles({players,total,persist,organizerName,viewerName,viewer,teamNames,teamCount,onRemove}:{players:CaptainPlayer[];total:number;persist:boolean|string;organizerName:string;viewerName:string;viewer?:Viewer;teamNames:string[];teamCount:number;onRemove:(key:string)=>void}) {
 const [captains,setCaptains]=usePersistedState<TeamCaptains>(persist,"teamCaptains",{});
 const [selected,setSelected]=useState<string|null>(null);
 const [handoff,setHandoff]=useState(false);
 const [message,setMessage]=useState("");
 const dialog=useRef<HTMLDialogElement>(null);
 const organizerKey=players.find(player=>player.name===organizerName)?.key??"trip-organizer";
 const [actorKey]=useState(()=>viewer==="organizer"?organizerKey:viewer==="captain-a"?captains["0"]??null:viewer==="captain-b"?captains["1"]??null:viewer==="player"?players.find(player=>player.key!==organizerKey&&captainTeam(captains,player.key)===null)?.key??null:viewerName===organizerName?organizerKey:players.find(player=>player.name===viewerName)?.key??null);
 const isOrganizer=!!actorKey && actorKey===organizerKey;
 const context:CaptainContext={players,organizerKey,actorKey,teamCount};
 const player=players.find(player=>player.key===selected);
 const selectedTeam=player?captainTeam(captains,player.key):null;
 const teamLabel=(team:number)=>teamNames[team]?.trim()||"Team "+String.fromCharCode(65+team);
 useEffect(()=>{if(!selected)return;const element=dialog.current;element?.showModal();return()=>element?.close();},[selected]);
 const close=()=>{setSelected(null);setHandoff(false);};
 const assign=(team:number)=>{if(!player)return;try{setCaptains(assignCaptain(context,captains,player.key,team));setMessage(player.name+" is now "+teamLabel(team)+" Captain.");close();}catch(error){setMessage(error instanceof Error?error.message:"Could not assign captain.");}};
 const transfer=(next:CaptainPlayer)=>{if(selectedTeam===null)return;try{setCaptains(handOffCaptain(context,captains,next.key,selectedTeam));setMessage("Captaincy passed to "+next.name+".");close();}catch(error){setMessage(error instanceof Error?error.message:"Could not pass captaincy.");}};
 return <>
  <div className={styles.columns} aria-hidden="true"><span>Player</span><span>Role</span></div>
  <ol className={list.lineup} aria-label="Players and roles">{Array.from({length:total},(_,index)=>{
   const item=players[index],team=item?captainTeam(captains,item.key):null;
   const role=item?playerRoleLabel(item.key,organizerKey,captains,teamNames):"Open spot";
   return <li key={item?.key??"open-"+index} className={styles.row}>
    <span className={list.rank}>{index+1}</span>
    <div className={styles.person}><span className={styles.name}>{item?.name??"Player "+(index+1)}</span>{item?.key===actorKey&&<small>You</small>}</div>
    {item?<button type="button" className={styles.role} data-captain={team!==null} aria-label={"Roles for "+item.name+": "+role} onClick={()=>{setSelected(item.key);setHandoff(false);setMessage("");}}>{role}<ChevronDown size={12}/></button>:<span className={styles.open}>Open spot</span>}
    {item&&<button type="button" className={settings.playerDelete} aria-label={"Delete "+item.name} disabled={!isOrganizer||item.key===organizerKey||team!==null} title={team!==null?"Assign a successor before removing a captain":item.key===organizerKey?"Organizer cannot be removed here":undefined} onClick={()=>onRemove(item.key)}><Trash2 size={17}/></button>}
   </li>;
  })}</ol>
  {message&&<p className={styles.message} role="status">{message}</p>}
  {selected&&player&&<dialog ref={dialog} className={styles.dialog} aria-labelledby="player-roles-title" onCancel={close}>
   <header><div><h2 id="player-roles-title">{player.name}</h2><p>{playerRoleLabel(player.key,organizerKey,captains,teamNames)}</p></div><button type="button" className={styles.close} aria-label="Close player roles" onClick={close}><X size={20}/></button></header>
   {selectedTeam===null?(isOrganizer?<><h3>Assign captain</h3><div className={styles.actions}>{Array.from({length:teamCount},(_,team)=><button key={team} type="button" disabled={player.team!==undefined&&player.team!==team} onClick={()=>assign(team)}>{captains[String(team)]?"Replace ":""}{teamLabel(team)} Captain</button>)}</div><p>The organizer can replace a captain. Captains can also pass their role to another player.</p></>:<p>The organizer assigns or replaces captains.</p>):actorKey===player.key?<><p>You captain {teamLabel(selectedTeam)}.</p>{!handoff?<button type="button" className={styles.primary} onClick={()=>setHandoff(true)}>Pass captaincy</button>:<><h3>Choose the next captain</h3><div className={styles.actions}>{players.filter(next=>next.key!==player.key&&captainTeam(captains,next.key)===null&&(next.team===undefined||next.team===selectedTeam)).map(next=><button key={next.key} type="button" onClick={()=>transfer(next)}>{next.name}</button>)}</div>{!players.some(next=>next.key!==player.key&&captainTeam(captains,next.key)===null&&(next.team===undefined||next.team===selectedTeam))&&<p>No eligible teammates available.</p>}</>}</>:<p>{isOrganizer?"Select another player to replace this captain.":player.name+" can pass captaincy to the next captain."}</p>}
  </dialog>}
 </>;
}
