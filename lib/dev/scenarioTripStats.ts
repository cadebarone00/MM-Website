import type {GolfMatchPreview,GolfLeaderboardEntry} from "@/lib/platform/golfTripPreviewFixture";
import type {GolfTripDraft} from "@/lib/platform/golfTripDraft";
import {plannedRounds} from "@/lib/platform/golfTripDraft";
import type {PlayerRound,PlayerRoundHole} from "@/lib/platform/playerRounds";
import {tripStats} from "@/lib/platform/tripStats";
import {resolveGolfFormat} from "@/lib/platform/formats";
/** Deterministic shot details for fictional cards; no account rounds are written. */
export function scenarioHoleDetails(row:GolfLeaderboardEntry,round:number,par:number[]):PlayerRoundHole[]{
 const hash=[...row.golfer.name].reduce((sum,char)=>sum+char.charCodeAt(0),round*31);
 return row.holes.flatMap((strokes,index)=>strokes===null?[]:[{number:index+1,par:par[index]??4,strokes,putts:row.putts?.[index]??2,fairway:par[index]===3?null:(hash+index)%5<3?"center" as const:"right" as const,green:(hash+index*3)%5<3?"center" as const:"left" as const}]);
}
export function scenarioTripStats(match:GolfMatchPreview,preview:GolfTripDraft,status:string){
 const tripId=match.devTripId??"scenario-trip",schedule=plannedRounds(preview);
 const rounds:PlayerRound[]=(match.roundStandings??[]).filter(snapshot=>snapshot.round<match.round||status==="between"||status==="complete").flatMap(snapshot=>{
  const format=preview["round"+snapshot.round+"Format"]??"Singles";
  if(!resolveGolfFormat(format).countsIndividualStats)return [];
  return snapshot.leaderboard.filter(row=>row.holes.length===18&&row.holes.every(strokes=>strokes!==null)).map(row=>{
   const holes=scenarioHoleDetails(row,snapshot.round,snapshot.par??match.par);
   return {id:tripId+":"+snapshot.round+":"+row.golfer.name,profileId:row.golfer.name,source:"trip",tripId,tripRoundId:"round-"+snapshot.round,datePlayed:schedule.find(round=>round.number===snapshot.round)?.date??"",course:{ref:null,name:preview["round"+snapshot.round+"Course"]??"Course TBD",place:preview.destination??""},tee:null,holesPlayed:18,format,holes,total:holes.reduce((sum,hole)=>sum+hole.strokes,0),countsForHandicap:false,notCountedReason:"Fictional development scenario",differential:null,enteredBy:"organizer",status:"submitted"} satisfies PlayerRound;
  });
 });
 const stats=tripStats(rounds,tripId);return {players:stats.players.map(player=>({...player,name:player.profileId})),trip:stats.trip,rounds};
}
