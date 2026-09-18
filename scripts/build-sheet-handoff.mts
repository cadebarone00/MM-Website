// Read-only repository export and synthetic fixtures; no network/database access.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { matchBoxResult, roundIsComplete } from '../lib/live/orchestration.ts';
import { buildOfficialMatchState } from '../lib/live/officialMatchState.ts';
import { holeSubmissionStatus, type HoleSubmission } from '../lib/live/holeSubmission.ts';
import { type LiveMatchBox, type LiveTournamentSnapshot, scoreKey } from '../lib/live/types.ts';

const sources = [
  'supabase/schema.sql', 'supabase/player_slots_email.sql',
  'supabase/career_live_archive.sql', 'supabase/live_match_publication.sql',
  'supabase/course_library_location.sql', 'supabase/course_library_tee_setups.sql',
  'supabase/archived_handicap_tees.sql', 'supabase/round_format_setups.sql',
  'supabase/hole_shot_directions.sql', 'supabase/hole_shot_directions_penalty.sql',
  'supabase/live_hole_submissions.sql', 'supabase/scoring_reliability.sql',
  'lib/live/types.ts', 'lib/live/orchestration.ts', 'lib/live/officialMatchState.ts',
  'lib/live/holeSubmission.ts', 'lib/live/useHoleQueue.ts',
  'lib/live/publishOfficialMatchState.ts', 'lib/live/retryPublication.ts',
  'lib/live/scoring.ts', 'lib/live/teeSets.ts', 'lib/live/syncLockedRound.ts',
  'lib/live/seasonYears.ts', 'lib/live/testSeason.ts',
  'lib/handicap/whs.ts', 'lib/leaderboard/sort.ts',
  'components/leaderboard/matchUtils.ts', 'components/leaderboard/LiveLeaderboardContent.tsx',
  'lib/data/live.ts', 'lib/data/players/index.ts',
  'app/api/portal/scoring/hole/route.ts', 'app/api/portal/scoring/stroke/route.ts',
  'app/api/portal/tiger/matchboxes/route.ts', 'app/api/portal/tiger/matchboxes/closeout/route.ts',
  'app/api/portal/tiger/rounds/lock/route.ts', 'app/api/portal/tiger/rounds/start/route.ts',
];
const revision = execFileSync('git', ['rev-parse', 'HEAD'], {encoding:'utf8'}).trim();
fs.writeFileSync('docs/google-sheet-backup-sources.md',
  '# Verbatim source companion for the Google Sheet backup\n\n' +
  `Repository reference: ${revision}. Exported from the working tree. No database rows or credentials.\n\n` +
  '**Reference only. Do not run this document as SQL.** These are incremental source files, not a flattened production schema. Follow the handoff for effective keys and limitations. Later migrations supersede older definitions; comments can describe older workflows.\n\n' +
  sources.map(file => `## ${file}\n\n\`\`\`${file.endsWith('.sql')?'sql':'typescript'}\n${fs.readFileSync(file,'utf8').trimEnd()}\n\`\`\`\n`).join('\n'));

let idCounter = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++idCounter).padStart(12,'0')}`;
const year = 2027;
const roster = ['maroon','white'].flatMap(team => Array.from({length:6},(_,i)=>({
  season_year:year, player_slug:`sample-${team}-${i+1}`, team:team as 'maroon'|'white',
  display_name:`Sample ${team} ${i+1}`, handicap_index:null,
})));
const actorIds=Object.fromEntries(roster.map(p=>[p.player_slug,uuid()]));
const holes = Array.from({length:18},(_,i)=>({number:i+1,par:[4,4,3,5,4,4,3,5,4][i%9],yards:[390,410,160,510,380,420,175,530,405][i%9]}));
const course = {id:uuid(),name:'Synthetic Practice Course',holes,rating:72,slope:120};
const tee = {id:'sample-gold',name:'Sample Gold',locked:true,rating:72,slope:120,holes};
const rounds = (['Fourball','Singles','Foursome'] as const).map((format,i)=>({
  season_year:year,round:i+1,date:i<2?'2027-01-06':'2027-01-07',format,course_id:course.id,
  course_locked:true,matchups_locked:true,started:true,
  course_setup:{teeSetId:tee.id,teeSetName:tee.name,rating:tee.rating,slope:tee.slope,holes},
}));
const snapshot:LiveTournamentSnapshot = {
  players:Object.fromEntries(roster.map(p=>[p.player_slug,{team:p.team}])),
  courses:{[course.id]:course},roundCourses:{1:course.id,2:course.id,3:course.id},scores:new Map(),matchBoxes:[],
};
const matches: unknown[] = [];
const submissions: unknown[] = [];
const currentHoles: unknown[] = [];
const teeGroups: {sheetTeeGroupId:string;matchBoxIds:string[];round:number}[] = [];
for (const round of rounds) {
  const count=round.format==='Singles'?6:3;
  for(let b=0;b<count;b++) {
    const perSide=round.format==='Singles'?1:2;
    const maroon=roster.filter(p=>p.team==='maroon').slice(b*perSide,b*perSide+perSide).map(p=>p.player_slug);
    const white=roster.filter(p=>p.team==='white').slice(b*perSide,b*perSide+perSide).map(p=>p.player_slug);
    const groupIndex=round.format==='Singles'?Math.floor(b/2):b;
    const time=`${round.date}T${round.round===2?'19':'14'}:${String(groupIndex*10).padStart(2,'0')}:00Z`;
    const box:LiveMatchBox={id:uuid(),seasonYear:year,round:round.round,boxNumber:b+1,format:round.format,teeTime:new Date(time),maroonPlayers:maroon,whitePlayers:white,state:'Live',started:true};
    snapshot.matchBoxes.push(box);
    const groupId=`sample-r${round.round}-tee${groupIndex+1}`;
    let group=teeGroups.find(g=>g.sheetTeeGroupId===groupId);
    if(!group){group={sheetTeeGroupId:groupId,matchBoxIds:[],round:round.round};teeGroups.push(group);}
    group.matchBoxIds.push(box.id!);
    // Cases: M wins holes 1-3 -> 3&2 at 16; W wins 1-2 -> 2&1 at 17; all halves.
    const kind=b%3;
    for(const h of holes){
      const m=h.par;
      const w=kind===0&&h.number<=3?h.par+1:kind===0&&h.number>16?h.par-1:kind===1&&h.number<=2?h.par-1:kind===1&&h.number===18?h.par+1:h.par;
      for(const [players,own,other] of [[maroon,m,w],[white,w,m]] as const){
        for(const player of players){
          snapshot.scores.set(scoreKey(player,round.round,h.number),{seasonYear:year,player,round:round.round,hole:h.number,score:own,putts:round.format==='Foursome'?null:2,fir:h.par===3||round.format==='Foursome'?null:true,gir:round.format==='Foursome'?null:true,hostEdited:false});
          currentHoles.push({season_year:year,round:round.round,match_box_id:box.id,player_slug:player,hole:h.number,score:own,self_reported_score:own,putts:round.format==='Foursome'?null:2,fir:h.par===3||round.format==='Foursome'?null:true,gir:round.format==='Foursome'?null:true,fir_direction:null,gir_direction:null,confirmed_by:player,did_not_finish:false,host_edited:false});
          // One submitter per side suffices for Foursome; both teammates get shared confirmed rows.
          if(round.format==='Foursome'&&player!==players[0])continue;
          submissions.push({match_box_id:box.id,player_slug:player,hole:h.number,request_id:uuid(),actor_profile_id:actorIds[player],submitted_at:new Date(new Date(time).getTime()+h.number*600000+(players===white?1000:0)).toISOString(),payload:{ownScore:own,opponentScore:other,putts:round.format==='Foursome'?null:2,fairway:h.par===3||round.format==='Foursome'?null:'hit',green:round.format==='Foursome'?null:'hit'}});
        }
      }
    }
    const result=matchBoxResult(snapshot,box);
    const official=buildOfficialMatchState(snapshot,box,new Date('2027-01-08T00:00:00Z'));
    assert.equal(result.leader,kind===0?'maroon':kind===1?'white':'tie');
    assert.equal(result.holesRemaining,kind===0?2:kind===1?1:0);
    assert.equal(official.status,'complete');
    matches.push({id:box.id,season_year:year,round:round.round,box_number:box.boxNumber,format:box.format,tee_time:time,maroon_players:maroon,white_players:white,state:'Live',started:true,expectedResult:result,expectedOfficialState:official,expectedLabel:kind===0?'3&2':kind===1?'2&1':'AS',sheetMetadata:{day:round.round===3?2:1,session:round.round===2?'Afternoon':'Morning',teeGroupId:groupId}});
  }
  assert.equal(roundIsComplete(snapshot,round.round,round.format),true);
}
const pair={format:'Singles' as const,maroonPlayers:['sample-maroon-1'],whitePlayers:['sample-white-1']};
const initial:HoleSubmission={player:pair.maroonPlayers[0],hole:1,submittedAt:'2027-01-06T19:10:00Z',ownScore:4,opponentScore:5,putts:2,fairway:'hit',green:'hit'};
const second:HoleSubmission={...initial,player:pair.whitePlayers[0],submittedAt:'2027-01-06T19:11:00Z',ownScore:5,opponentScore:4};
const edited={...initial,submittedAt:'2027-01-06T19:12:00Z',ownScore:3};
const corrected={...second,submittedAt:'2027-01-06T19:13:00Z',opponentScore:3};
const scenarios=[
  {label:'one side only',submissions:[initial],expected:'submitted',archiveAction:'none'},
  {label:'both agree',submissions:[initial,second],expected:'confirmed',archiveAction:'upsert both'},
  {label:'edit disagrees',submissions:[edited,second],expected:'disputed',archiveAction:'retract both'},
  {label:'opponent corrects',submissions:[edited,corrected],expected:'confirmed',archiveAction:'upsert both'},
];
for(const s of scenarios)assert.equal(holeSubmissionStatus(pair,initial.player,1,s.submissions),s.expected);
assert.equal(matches.length,12);
assert.equal(currentHoles.length,648);
assert.equal(submissions.length,540);
fs.writeFileSync('docs/google-sheet-backup-sample.json',JSON.stringify({
  fixtureOnly:true,schemaVersion:1,notes:'Synthetic full Day 1 plus a Day 2 Foursome round. This is an integration fixture, not a direct database import. Submission rows combine table fields and request/audit metadata. No Tiger closeout has occurred. Day/session and tee groups are sheet metadata.',
  seasonYear:year,displayTimezone:'America/Chicago',roster,courses:[{...course,tee_sets:[tee]}],rounds,matches,teeGroups,submissions,currentHoles,reconciliationScenario:{pair,steps:scenarios},
},null,2)+'\n');
console.log(`Exported ${sources.length} source files; validated 12 matches, 648 confirmed player-hole rows, 540 submissions and four reconciliation stages.`);
