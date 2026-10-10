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
 const orderedNames=[...original.leaderboard.map(row=>row.golfer.name).filter(name=>names.includes(name)),...names.filter(name=>!byName.has(name))];
 const leaderboard=Array.from({length:count},(_,index)=>{
  const name=orderedNames[index]??'Player '+(index+1);
  return byName.get(name)??{...edited.previewMatch!.leaderboard[index],position:String(index+1),golfer:{name,hcp:0,thru:'—',score:'—',teeTime:'',course:current?edited.preview?.['round'+round+'Course']??'':''},holes:Array(18).fill(null),total:'—',today:'—',netToday:'—',netTotal:'—',thru:'—'};
 });
 const sourceNames=base.travel?.members.map(m=>m.name)??original.leaderboard.map(row=>row.golfer.name);
 if(edited.preview)edited.preview.playerCount=String(count);
 let matches=original.matches.filter(pair=>![pair.left,pair.right].some(side=>side&&normalizeCompetitor(side).golfers.some(g=>saved.removedPlayers?.has(sourceNames.indexOf(g.name)+':'+g.name))));
 if(saved.submittedTeams){
  const teams=saved.submittedTeams;
  const golfer=(index:number)=>leaderboard.find(row=>row.golfer.name===names[index])?.golfer;
  const sides=(team:number,indices:number[])=>({name:saved.teamNames?.[team]||original.sides[team%2].name,golfers:indices.map(golfer).filter((g):g is NonNullable<typeof g>=>!!g)});
  const unplayed=[...new Set(matches.filter(pair=>!pair.result&&pair.gross===null&&pair.net===null).map(pair=>pair.round??original.round))];
  for(const n of unplayed){
   matches=matches.filter(pair=>(pair.round??original.round)!==n||!!pair.result||pair.gross!==null||pair.net!==null);
   if(teams.length===2){for(let index=0;index<Math.max(teams[0].length,teams[1].length);index++)matches.push({round:n,left:sides(0,teams[0][index]===undefined?[]:[teams[0][index]]),right:sides(1,teams[1][index]===undefined?[]:[teams[1][index]]),gross:null,net:null});}
   else for(let team=0;team<teams.length;team+=2)matches.push({round:n,left:sides(team,teams[team]),right:teams[team+1]?sides(team+1,teams[team+1]):undefined,gross:null,net:null});
  }
 }
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
 matches=matches.map(pair=>{
  const r=rounds.find(item=>item.number===(pair.round??original.round));if(!r)return pair;
  const d=days.indexOf(r.date),sl=rounds.filter(item=>item.date===r.date).findIndex(item=>item.number===r.number),k=d+'-'+sl;
  const course=edited.preview?.['round'+r.number+'Course'];
  const updateSide=(input:typeof pair.left)=>{
   const side=normalizeCompetitor(input);
   const group=Object.entries(saved.teePlayers?.[k]??{}).find(([,players])=>side.golfers.some(g=>players.includes(sourceNames.indexOf(g.name))))?.[0];
   const time=group!==undefined?saved.teeTimes?.[k]?.[Number(group)]:undefined;
   if(!time&&course===base.preview?.['round'+r.number+'Course'])return input;
   return {...side,...(time?{teeTime:time}:{}),...(course?{course}:{}),golfers:side.golfers.map(g=>({...g,...(time?{teeTime:time}:{}),...(course?{course}:{})}))};
  };
  return {...pair,left:updateSide(pair.left),right:pair.right?updateSide(pair.right):undefined};
 });
 return {...edited,previewMatch:{...original,...(format?{format:format.format,formatDef:format.formatDef}:{}),...(config?{handicap:config.scoring!=='Gross',scoring:config.scoring}:{}),round,roundCount:Math.max(1,rounds.length),course:edited.preview?.['round'+round+'Course']??original.course,roundDate:current?.date??original.roundDate,leaderboard,matches,sides:original.sides.map((side,index)=>({...side,name:saved.teamNames?.[index]||side.name})) as typeof original.sides}};
}
