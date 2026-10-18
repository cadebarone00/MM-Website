import type { MatchDraftPlayer, MatchDraftRound } from "@/lib/platform/matchDraft";

export const MATCH_DRAFT_PREVIEWS = ["Response", "Ranks", "Randomized"] as const;
export type MatchDraftPreview = (typeof MATCH_DRAFT_PREVIEWS)[number];

/** Isolated simulator data; never writes organizer settings. */
export function matchDraftPreviewData(players: MatchDraftPlayer[], courses: string[], startAt = "2027-04-20T18:00", first: MatchDraftPreview = "Response") {
  const enough = (["A","B"] as const).every(team => players.filter(player=>player.team===team).length >= 2);
  const roster: MatchDraftPlayer[] = enough ? players : ["Alex Morgan","Jordan Reed","Sam Taylor","Casey Brooks","Riley Parker","Jamie Hayes","Drew Carter","Morgan Lee"].map((name,index)=>({id:"preview-"+index,name,handicap:6+index,team:index<4?"A":"B"}));
  const methods = [first,...MATCH_DRAFT_PREVIEWS.filter(method=>method!==first)];
  const rounds: MatchDraftRound[] = [...methods.map(type=>({type,perSide:1})),...methods.map(type=>({type,perSide:2}))].map(({type,perSide},index)=>{
    const date = new Date(Date.parse(startAt+ (startAt.length===16?":00Z":"Z"))+(index+2)*86400000).toISOString().slice(0,10);
    return {key:"preview-"+type+(perSide===2?"-pairs":""),rankMinutes:10,putForwardMinutes:10,responseMinutes:10,number:index+2,course:courses[index] || "Canyon Ridge",format:perSide===2?"Fourball":"Singles",perSide,matches:Math.floor(Math.min(...(["A","B"] as const).map(team=>roster.filter(player=>player.team===team).length))/perSide),type,date,time:"18:00",when:date+" - 6:00 PM"};
  });
  return {players:roster,rounds};
}
