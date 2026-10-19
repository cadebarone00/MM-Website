import type { SimulatorConfig, SimulatorState } from "./simulator";
export const SCENARIO_START="2027-04-22";
export const scenarioDay=(day:string,offset:number)=>new Date(Date.parse(day+"T12:00:00Z")+offset*86400000).toISOString().slice(0,10);
export function isTripScenario(config:SimulatorConfig){return (config.source==="mock"||config.source==="busy")&&config.state.tripLength!==undefined;}
/** Resolve dependent choices once, before generation and at the simulator boundary. */
export function normalizeTripScenario(state:SimulatorState):SimulatorState {
 if(state.tripLength===undefined)return state;
 const length=Math.max(1,Math.min(14,state.tripLength));
 const moment=state.tripMoment??"during";
 const setup=state.competition==="no"?"none":state.competitionSetup==="none"?"none":state.competitionSetup??"both";
 const team=setup==="both"||setup==="team";
 const before=moment==="30-days"||moment==="day-before";
 const status=before?"scheduled":moment==="complete"?"complete":["live","roundEnd","between","scheduled"].includes(state.roundStatus)?state.roundStatus:"live";
 return {...state,tripLength:length,tripDay:Math.max(1,Math.min(length,state.tripDay??1)),tripMoment:moment,tripRoundsPerDay:state.tripRoundsPerDay??1,tripRoundSlot:Math.min(state.tripRoundSlot??1,state.tripRoundsPerDay??1),competition:setup==="none"?"no":"yes",competitionSetup:setup,playerCount:Math.max(team?2:1,state.playerCount??8),roundStatus:status,draftProgress:!team||!before?"ready":state.draftProgress??"ready",dualDraftMomentum:false,matchDraftPreview:"off"};
}
export function scenarioClock(state:SimulatorState){
 const s=normalizeTripScenario(state),moment=s.tripMoment;
 if(moment==="30-days")return scenarioDay(SCENARIO_START,-30)+"T12:00:00";
 if(moment==="day-before")return scenarioDay(SCENARIO_START,-1)+"T12:00:00";
 if(moment==="complete")return scenarioDay(SCENARIO_START,s.tripLength??4)+"T12:00:00";
 const afternoon=s.tripRoundSlot===2;
 const time=s.roundStatus==="scheduled"?(afternoon?"13:00":"08:00"):s.roundStatus==="live"?(afternoon?"15:30":"10:30"):(afternoon?"18:30":"13:30");
 return scenarioDay(SCENARIO_START,(s.tripDay??1)-1)+"T"+time+":00";
}
/** Seed the same organizer setup consumed by Home, Settings and draft rooms. */
export function tripScenarioSetup(config:SimulatorConfig):Record<string,unknown>{
 if(!isTripScenario(config))return {};
 const s=normalizeTripScenario(config.state),count=s.playerCount??8,team=s.competitionSetup==="both"||s.competitionSetup==="team";
 const types={individual:s.competitionSetup==="both"||s.competitionSetup==="individual"?"Stroke Play":null,team:team?"2 Teams":null};
 const ready=team&&s.draftProgress!=="team-draft";
 const split=[Array.from({length:Math.ceil(count/2)},(_,i)=>i),Array.from({length:Math.floor(count/2)},(_,i)=>Math.ceil(count/2)+i)];
 const before=s.tripMoment==="30-days"||s.tripMoment==="day-before";
 const date=before?scenarioClock(s).slice(0,10):scenarioDay(SCENARIO_START,-1);
 const teamTime=s.draftProgress==="team-draft"?"13:00":"09:00",matchTime=s.draftProgress==="team-draft"?"13:20":s.draftProgress==="match-draft"?"13:00":"09:20";
 return {scenarioInitialized:true,dayCount:s.tripLength,golfOnArrival:true,golfOnDeparture:true,localCompetitionType:types,teamNames:team?["Maroon","White"]:[],teamSelection:team?"Draft":null,draftDate:date,draftTime:teamTime,draftType:"Snake",draftMethod:"Captain's Picks",submittedTeams:ready?split:null,teamPicks:ready?Object.fromEntries(split.flatMap((indices,t)=>indices.map(index=>[index,t]))):{},roundsPerDay:Object.fromEntries(Array.from({length:s.tripLength??4},(_,i)=>[i,s.tripRoundsPerDay??1])),allRoundsMatch:{method:team?"Match Draft":"Randomized",draftType:"Ranks",date,time:matchTime},matchPerRound:false,completedMatchDrafts:s.draftProgress==="ready"?Array.from({length:(s.tripLength??4)*(s.tripRoundsPerDay??1)},(_,index)=>Math.floor(index/(s.tripRoundsPerDay??1))+"-"+(index%(s.tripRoundsPerDay??1))):[]};
}
