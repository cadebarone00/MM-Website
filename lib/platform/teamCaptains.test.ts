import test from "node:test";
import assert from "node:assert/strict";
import {assignCaptain,handOffCaptain,playerRoleLabel,type CaptainContext} from "./teamCaptains";
const players=[{key:"0:Organizer",name:"Organizer",team:0},{key:"1:Cam",name:"Cam",team:1},{key:"2:Cade",name:"Cade",team:0},{key:"3:Luke",name:"Luke",team:1}];
const context:CaptainContext={players,organizerKey:"0:Organizer",actorKey:"0:Organizer",teamCount:2};
test("organizer can captain own team and assign the other captain without changing organizer",()=>{
 const first=assignCaptain(context,{},players[0].key,0);const both=assignCaptain(context,first,players[1].key,1);
 assert.equal(playerRoleLabel(players[0].key,context.organizerKey,both,[]),"Organizer & Captain");
 assert.equal(playerRoleLabel(players[1].key,context.organizerKey,both,["Maroon","White"]),"White Captain");
 assert.equal(playerRoleLabel(players[2].key,context.organizerKey,both,[]),"Player");assert.equal(context.organizerKey,players[0].key);
});
test("organizer can replace a captain; only current captain can hand off",()=>{
 const captains={0:players[0].key,1:players[1].key};
 const replacement=assignCaptain(context,captains,players[3].key,1);
 assert.equal(replacement[1],players[3].key);
 assert.equal(playerRoleLabel(players[1].key,context.organizerKey,replacement,[]),"Player");
 assert.throws(()=>handOffCaptain({...context,actorKey:players[1].key},replacement,players[1].key,1),/current captain/);
 assert.throws(()=>assignCaptain({...context,actorKey:players[1].key},captains,players[3].key,1),/organizer/);
 assert.throws(()=>handOffCaptain(context,captains,players[3].key,1),/current captain/);
 const next=handOffCaptain({...context,actorKey:players[1].key},captains,players[3].key,1);
 assert.equal(playerRoleLabel(players[1].key,context.organizerKey,next,["Maroon","White"]),"Player");
 assert.throws(()=>handOffCaptain({...context,actorKey:players[1].key},next,players[1].key,1),/current captain/);
});
test("captaincy is unique, team-scoped, restricted to known players and independent of organizer",()=>{
 const captains={0:players[0].key,1:players[1].key};
 assert.throws(()=>handOffCaptain(context,captains,players[1].key,0),/already a captain/);
 assert.throws(()=>handOffCaptain(context,captains,players[3].key,0),/on this team/);
 assert.throws(()=>assignCaptain(context,{},"unknown",0),/joined player/);
 assert.throws(()=>assignCaptain({...context,actorKey:players[2].key},{},players[2].key,0),/organizer/);
 assert.throws(()=>assignCaptain({...context,actorKey:null,organizerKey:null},{},players[2].key,0),/organizer/);
 const next=handOffCaptain(context,captains,players[2].key,0);
 assert.equal(playerRoleLabel(players[0].key,context.organizerKey,next,[]),"Organizer");
 assert.equal(playerRoleLabel(players[2].key,context.organizerKey,next,["Gold"]),"Gold Captain");
});
test("captain labels follow team names and stable player keys through roster reordering",()=>{
 const captains={0:players[0].key};assert.equal(playerRoleLabel(players[0].key,context.organizerKey,captains,[" Gold "]),"Organizer & Gold Captain");
 assert.equal(playerRoleLabel([...players].reverse()[3].key,context.organizerKey,captains,["Gold"]),"Organizer & Gold Captain");
});
