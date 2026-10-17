import { matchDraftPlayerId, matchDraftSideSize, placeMatchDraftPlayer, responseDraftTurn, type MatchDraftPlacement, type MatchDraftPlayer, type MatchDraftRound } from "./matchDraft";

export type MatchDraftSession = { startedAt: number; deadline: number; placements: MatchDraftPlacement[]; pending: string[]; autoFilledGroups: number; blockedReason?: string };
export const draftMinutes = (value?: number) => Number.isInteger(value) && value! >= 1 && value! <= 120 ? value! : 10;
export function responseStage(match: number,team: "A" | "B") { return team === (match % 2 ? "B" : "A") ? "opening" : "responding"; }
const turnMillis = (round: MatchDraftRound, match: number,team: "A" | "B") => draftMinutes(responseStage(match,team) === "opening" ? round.putForwardMinutes : round.responseMinutes) * 60000;
export function startMatchDraftSession(round: MatchDraftRound,players: MatchDraftPlayer[],now: number): MatchDraftSession {
 if(round.locked) throw new Error("This round has already started.");
 if(!["Ranks","Response"].includes(round.type) || !round.matches) throw new Error("Choose a timed match draft round.");
 const needed=round.matches*matchDraftSideSize(round);
 for(const team of ["A","B"] as const) if(new Set(players.filter(p=>p.team===team).map(matchDraftPlayerId)).size<needed) throw new Error("Team "+team+" needs "+needed+" players for this round.");
 return {startedAt:now,deadline:now+(round.type==="Ranks"?draftMinutes(round.rankMinutes)*60000:turnMillis(round,0,"A")),placements:[],pending:[],autoFilledGroups:0};
}
export function draftSessionLocked(round: MatchDraftRound,session: MatchDraftSession | undefined,now: number) {
 return !!(round.locked || !session || session.blockedReason || (round.type==="Ranks" ? now>=session.deadline : round.type==="Response" ? !responseDraftTurn(round,session.placements) || now>=session.deadline : false));
}
export function setRankSlot(round: MatchDraftRound,players: MatchDraftPlayer[],session: MatchDraftSession,player: string,match: number,team: "A"|"B",slot: number,now: number): MatchDraftSession {
 if(round.type!=="Ranks" || draftSessionLocked(round,session,now)) return session;
 return {...session,placements:placeMatchDraftPlayer(round,players,session.placements,player,match,team,slot)};
}
export function clearRankSlot(round: MatchDraftRound,session: MatchDraftSession,match: number,team: "A"|"B",slot: number,now: number): MatchDraftSession {
 if(round.type!=="Ranks" || draftSessionLocked(round,session,now)) return session;
 return {...session,placements:session.placements.filter(p=>!(p.match===match&&p.team===team&&p.slot===slot))};
}
export function swapRankGroups(round: MatchDraftRound,session: MatchDraftSession,team: "A"|"B",match: number,other: number,now: number): MatchDraftSession {
 if(round.type!=="Ranks" || draftSessionLocked(round,session,now) || match<0 || other<0 || match>=round.matches || other>=round.matches) return session;
 return {...session,placements:session.placements.map(p=>p.team===team?{...p,match:p.match===match?other:p.match===other?match:p.match}:p)};
}
export function chooseResponsePlayer(round: MatchDraftRound,players: MatchDraftPlayer[],session: MatchDraftSession,id: string,now: number): MatchDraftSession {
 if(round.type!=="Response" || draftSessionLocked(round,session,now) || session.pending.length>=matchDraftSideSize(round)) return session;
 const turn=responseDraftTurn(round,session.placements);
 if(!turn || !players.some(p=>matchDraftPlayerId(p)===id&&p.team===turn.team) || session.pending.includes(id) || session.placements.some(p=>p.player===id)) return session;
 return {...session,pending:[...session.pending,id]};
}
function commitResponse(round: MatchDraftRound,players: MatchDraftPlayer[],session: MatchDraftSession,ids: string[],at: number): MatchDraftSession {
 const turn=responseDraftTurn(round,session.placements);
 if(!turn || ids.length!==matchDraftSideSize(round) || new Set(ids).size!==ids.length || ids.some(id=>session.placements.some(p=>p.player===id)||!players.some(p=>matchDraftPlayerId(p)===id&&p.team===turn.team))) throw new Error("Choose a complete single or pairing from this team's available players.");
 let placements=session.placements;
 ids.forEach((id,slot)=>{placements=placeMatchDraftPlayer(round,players,placements,id,turn.match,turn.team,slot);});
 const next=responseDraftTurn(round,placements);
 return {...session,placements,pending:[],deadline:next?at+turnMillis(round,next.match,next.team):at};
}
export function submitResponseGroup(round: MatchDraftRound,players: MatchDraftPlayer[],session: MatchDraftSession,now: number): MatchDraftSession {
 if(round.type!=="Response" || draftSessionLocked(round,session,now)) throw new Error("This turn is locked.");
 return commitResponse(round,players,session,session.pending,now);
}
/** Catch up expired turns at their original deadlines, even after a throttled/background tab. */
export function advanceResponseTimeouts(round: MatchDraftRound,players: MatchDraftPlayer[],session: MatchDraftSession,now: number,random: ()=>number = Math.random): MatchDraftSession {
 if(round.type!=="Response" || round.locked || session.blockedReason) return session;
 let next=session;
 for(let count=0;count<round.matches*2 && next.deadline<=now;count++) {
  const turn=responseDraftTurn(round,next.placements);if(!turn)break;
  const available=[...new Set(players.filter(p=>p.team===turn.team&&!next.placements.some(item=>item.player===matchDraftPlayerId(p))).map(matchDraftPlayerId))];
  const ids=next.pending.filter(id=>available.includes(id));
  const remaining=available.filter(id=>!ids.includes(id));
  for(let i=remaining.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[remaining[i],remaining[j]]=[remaining[j],remaining[i]];}
  const group=[...ids,...remaining].slice(0,matchDraftSideSize(round));
  try {next={...commitResponse(round,players,next,group,next.deadline),autoFilledGroups:next.autoFilledGroups+1};}
  catch {return {...next,blockedReason:"Not enough available players to finish this turn. Organizer action required."};}
 }
 return next;
}
