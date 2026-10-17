import test from "node:test";
import assert from "node:assert/strict";
import { matchDraftTimeError, draftScheduleError } from "./draftSchedule";
import { validSetup } from "./savedTripSetup";
const team={selection:"Draft",date:"2027-04-20",time:"23:55"};
test("match draft minimum is ten minutes after team draft across midnight",()=>{
 assert.ok(matchDraftTimeError(team,"2027-04-20","23:55"));
 assert.ok(matchDraftTimeError(team,"2027-04-21","00:04"));
 assert.equal(matchDraftTimeError(team,"2027-04-21","00:05"),null);
 assert.equal(matchDraftTimeError({...team,selection:"Manual"},"2027-04-20","23:55"),null);
});
test("global and per-round effective schedules reject early matches; incomplete setup stays editable",()=>{
 const choice={method:"Match Draft",draftType:"Response",date:"2027-04-21",time:"00:05"};
 const setup={teamSelection:"Draft",draftDate:team.date,draftTime:team.time,allRoundsMatch:choice};
 assert.equal(draftScheduleError(setup),null);assert.equal(validSetup(setup),true);
 const invalid={...setup,matchSelections:{"0-0":{...choice,time:"00:04"}}};
 assert.ok(draftScheduleError(invalid));assert.equal(validSetup(invalid),false);
 assert.ok(draftScheduleError({...invalid,matchPerRound:true}));
 assert.equal(draftScheduleError({...invalid,matchPerRound:true,matchSelections:{"0-0":{...choice,method:"Manual",time:"00:04"}}}),null);
 assert.equal(draftScheduleError({...setup,draftTime:""}),null);
});
