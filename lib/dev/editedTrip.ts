import { applyJustCreatedSetup, type JustCreatedSetup } from './justCreatedTrip';
import type { SimulatorTripData } from './golfTripSimulatorData';
import { plannedRounds } from '@/lib/platform/golfTripDraft';
import { normalizeCompetitor, GOLF_MATCH_PREVIEWS } from '@/lib/platform/golfTripPreviewFixture';
import { defaultRoundComp, matchesPerTeeTime } from '@/lib/platform/roundCompetition';
/** Apply shared setup without replacing imported scores/results with an empty onboarding fixture. */
export function applyEditedTrip(base:SimulatorTripData,saved:JustCreatedSetup):SimulatorTripData {
 if(!Object.keys(saved).length)return base;
 const edited=applyJustCreatedSetup(base,saved),original=base.previewMatch;
 if(!original||!edited.previewMatch)return edited;
 const rounds=plannedRounds(edited.preview??{}),round=Math.min(original.round,Math.max(1,rounds.length));
 const current=rounds.find(r=>r.number===round);
 const days=[...new Set(rounds.map(r=>r.date))];
 const day=days.indexOf(current?.date??''),slot=rounds.filter(r=>r.date===current?.date).findIndex(r=>r.number===round),key=day+'-'+slot;
 const config=saved.compFormats?.[key];
 const formatKeys:Record<string,string>={Singles:'singles',Fourball:'fourball','Alternate Shot':'foursome',Chapman:'chapman',Scramble:'scramble',Shamble:'shamble','Stroke Play':'singlesstroke',Stableford:'stableford'};
 const format=config?GOLF_MATCH_PREVIEWS[formatKeys[config.format]]:undefined;
 const byName=new Map(original.leaderboard.map(row=>[row.golfer.name,row]));
 const names=(edited.travel?.members??[]).filter((m,index)=>!saved.removedPlayers?.has(index+':'+m.name)).map(m=>m.name);
 const count=saved.playerTotal??Number(base.preview?.playerCount??original.leaderboard.length);
 const leaderboard=Array.from({length:count},(_,index)=>{
  const name=names[index]??original.leaderboard[index]?.golfer.name??'Player '+(index+1);
  return byName.get(name)??{...edited.previewMatch!.leaderboard[index],position:String(index+1),golfer:{name,hcp:0,thru:'—',score:'—',teeTime:'',course:current?edited.preview?.['round'+round+'Course']??'':''},holes:Array(18).fill(null),total:'—',today:'—',netToday:'—',netTotal:'—',thru:'—'};
 });
 let matches=original.matches.filter(pair=>![pair.left,pair.right].some(side=>side&&normalizeCompetitor(side).golfers.some(g=>saved.removedPlayers?.has(names.indexOf(g.name)+':'+g.name))));
 // Replace only rounds whose matchups were explicitly edited; untouched published results remain intact.
 for(const r of rounds){
  const d=days.indexOf(r.date),sl=rounds.filter(x=>x.date===r.date).findIndex(x=>x.number===r.number),k=d+'-'+sl;
  const assignments=saved.teeMatches?.[k];if(!assignments)continue;
  const perGroup=matchesPerTeeTime((saved.compFormats?.[k]??defaultRoundComp(0)).format);
  matches=matches.filter(pair=>(pair.round??original.round)!==r.number);
  for(const [number,sides] of Object.entries(assignments)){
   const time=saved.teeTimes?.[k]?.[Math.floor(Number(number)/perGroup)]??'';
   const side=(team:0|1,indices:(number|null)[])=>({name:saved.teamNames?.[team]||original.sides[team].name,teeTime:time,golfers:indices.filter((n):n is number=>n!==null).map(n=>leaderboard.find(row=>row.golfer.name===names[n])?.golfer).filter((g):g is NonNullable<typeof g>=>!!g)});
   if(!sides.a.some(n=>n!==null)&&!sides.b.some(n=>n!==null))continue;
   matches.push({round:r.number,left:side(0,sides.a),right:side(1,sides.b),gross:null,net:null});
  }
 }
 return {...edited,previewMatch:{...original,...(format?{format:format.format,formatDef:format.formatDef}:{}),...(config?{handicap:config.scoring!=='Gross',scoring:config.scoring}:{}),round,roundCount:Math.max(1,rounds.length),course:edited.preview?.['round'+round+'Course']??original.course,roundDate:current?.date??original.roundDate,leaderboard,matches,sides:original.sides.map((side,index)=>({...side,name:saved.teamNames?.[index]||side.name})) as typeof original.sides}};
}
